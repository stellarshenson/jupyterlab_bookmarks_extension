"""Tests of the `jupyterlab-bookmarks` command line."""
import json
import os
import socket
import subprocess
import sys
import threading
import tomllib
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from jupyterlab_bookmarks_manager_extension import cli
from jupyterlab_bookmarks_manager_extension.cli import Refused, _pick_server, _token, main

SKILL = "jupyterlab-bookmarks-manager-extension"
SCOPED_FOLDER = "@stellarshenson/jupyterlab-bookmarks-manager-extension"
WRITE_ROUTE = "/jupyterlab-bookmarks-manager-extension/settings-write"

# Every variable that names a lab or carries its token; no test may inherit one.
DISCOVERY = (
    "JUPYTERHUB_API_TOKEN",
    "JPY_API_TOKEN",
    "JUPYTER_TOKEN",
    "JUPYTER_PORT",
    "JUPYTER_SERVER_URL",
    "JUPYTER_SERVER_ROOT",
    "JUPYTERHUB_SERVICE_PREFIX",
    "JUPYTERHUB_SERVICE_URL",
)


@pytest.fixture(autouse=True)
def no_lab(tmp_path, monkeypatch):
    """Keep every test off a running lab: no discovery variable, and `jupyter` lists nothing."""
    for name in DISCOVERY:
        monkeypatch.delenv(name, raising=False)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "jupyter"
    fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    return fake


@pytest.fixture
def settings(tmp_path, monkeypatch):
    """The settings file of a fresh lab, with `JUPYTERLAB_SETTINGS_DIR` pointed at it."""
    monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
    return tmp_path / SCOPED_FOLDER / "plugin.jupyterlab-settings"


def fake_records(tmp_path, records):
    """Point the fake `jupyter` at a script that prints `records`, one JSON object per line."""
    lines = "\n".join(json.dumps(record) for record in records)
    (tmp_path / "bin" / "jupyter").write_text(
        f"#!/bin/sh\ncat <<'RECORDS'\n{lines}\nRECORDS\n", encoding="utf-8"
    )


def run(capsys, *argv):
    """Run the command line and return (exit code, stdout, stderr)."""
    code = main(list(argv))
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def bookmarks(path):
    """The `bookmarks` value of the settings file at `path`."""
    return json.loads(path.read_text(encoding="utf-8"))["bookmarks"]


def free_port():
    """A loopback port with nothing listening: bound, then released before use."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class StubServer:
    """A local settings API stub in a thread; it records each request and serves `raw`.

    With `xsrf` set it also serves a base page that sets the `_xsrf` cookie, and refuses a
    write that does not carry that value in `X-XSRFToken`. `write_status` makes the write route
    answer that status and save nothing; otherwise the route compares the base with `raw`.
    """

    def __init__(self, raw="{}", status=200, xsrf=None, write_status=None):
        self.raw = raw
        self.status = status
        self.xsrf = xsrf
        self.write_status = write_status
        self.requests = []
        self.xsrf_headers = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                stub.requests.append(
                    ("GET", self.path, self.headers.get("Authorization"), None)
                )
                if stub.xsrf is not None and self.path == "/":
                    body = b"<html></html>"
                    self.send_response(200)
                    self.send_header("Set-Cookie", f"_xsrf={stub.xsrf}; Path=/")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if stub.status != 200:
                    self.send_response(stub.status)
                    self.end_headers()
                    return
                body = json.dumps(
                    {"raw": stub.raw, "settings": json.loads(stub.raw)}
                ).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_PUT(self):
                if (body := self._accepted_body()) is not None:
                    stub.raw = json.loads(body)["raw"]
                    self.send_response(204)
                    self.end_headers()

            def do_POST(self):
                if (body := self._accepted_body()) is None:
                    return
                payload = json.loads(body)
                if stub.write_status is not None:
                    self.send_response(stub.write_status)
                elif payload["base"] != stub.raw:
                    self.send_response(409)
                else:
                    stub.raw = payload["raw"]
                    self.send_response(204)
                self.end_headers()

            def _accepted_body(self):
                """Record a write and return its body; a write the XSRF check refuses gives None."""
                body = self.rfile.read(int(self.headers["Content-Length"]))
                stub.requests.append(
                    (self.command, self.path, self.headers.get("Authorization"), body)
                )
                stub.xsrf_headers.append(self.headers.get("X-XSRFToken"))
                if stub.xsrf is None or self.headers.get("X-XSRFToken") == stub.xsrf:
                    return body
                answer = b"'_xsrf' argument missing from POST"
                self.send_response(403)
                self.send_header("Content-Length", str(len(answer)))
                self.end_headers()
                self.wfile.write(answer)
                return None

            def log_message(self, *args):
                pass

        self._server = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self._server.server_address[1]

    def __enter__(self):
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exception):
        self._server.shutdown()
        self._thread.join()
        self._server.server_close()

    def headers(self):
        """The Authorization header of every request, in arrival order."""
        return [authorization for _method, _path, authorization, _body in self.requests]


def test_add_link_and_file(settings, capsys):
    settings.parent.mkdir(parents=True)
    settings.write_text(
        json.dumps(
            {
                "bookmarks": {
                    "version": 1,
                    "links": [
                        {"kind": "folder", "id": "f", "name": "Tools", "children": []}
                    ],
                    "files": [],
                    "sessions": [],
                }
            }
        ),
        encoding="utf-8",
    )

    code, out, err = run(capsys, "add", "link", "https://example.com/page")
    assert (code, err) == (0, "")
    link_id = out.strip()
    assert out == f"{link_id}\n"
    assert uuid.UUID(link_id).version == 4

    code, out, err = run(capsys, "add", "file", "data/report.csv")
    assert (code, err) == (0, "")
    file_id = out.strip()

    code, out, err = run(capsys, "add", "file", "data/archive/")
    assert (code, err) == (0, "")
    archive_id = out.strip()

    code, out, err = run(
        capsys, "add", "link", "https://example.com/two", "--folder", "Tools"
    )
    assert (code, err) == (0, "")
    folder_link_id = out.strip()

    value = bookmarks(settings)
    assert value["version"] == 1
    assert value["links"][0] == {
        "kind": "folder",
        "id": "f",
        "name": "Tools",
        "children": [
            {
                "kind": "link",
                "id": folder_link_id,
                "name": "https://example.com/two",
                "url": "https://example.com/two",
            }
        ],
    }
    assert value["links"][1] == {
        "kind": "link",
        "id": link_id,
        "name": "https://example.com/page",
        "url": "https://example.com/page",
    }
    assert value["files"] == [
        {
            "kind": "file",
            "id": file_id,
            "name": "report.csv",
            "path": "data/report.csv",
        },
        {
            "kind": "file",
            "id": archive_id,
            "name": "archive",
            "path": "data/archive/",
        },
    ]
    assert value["sessions"] == []


def test_add_session_defaults(settings, capsys):
    code, out, err = run(
        capsys,
        "add",
        "session",
        "sleep 300",
        "--env",
        "K=v",
        "--env",
        "A=b=c",
        "--env",
        "PATH=/opt/tool/bin",
    )
    assert (code, err) == (0, "")
    assert bookmarks(settings)["sessions"] == [
        {
            "kind": "session",
            "id": out.strip(),
            "name": "sleep 300",
            "cwd": os.getcwd(),
            "command": "sleep 300",
            "env": {"K": "v", "A": "b=c", "PATH": "/opt/tool/bin"},
        }
    ]

    code, out, err = run(
        capsys, "add", "session", "jupyter lab", "--cwd", "/tmp", "--name", "Lab"
    )
    assert (code, err) == (0, "")
    assert bookmarks(settings)["sessions"][1]["cwd"] == "/tmp"
    assert bookmarks(settings)["sessions"][1]["name"] == "Lab"


def test_refusals(settings, capsys):
    settings.parent.mkdir(parents=True)
    settings.write_text("{ not json5", encoding="utf-8")
    code, out, err = run(capsys, "add", "link", "https://example.com/")
    assert (code, out) == (1, "")
    assert "Settings Editor" in err and "run this command again" in err

    value = {"version": 1, "links": [], "files": [], "sessions": []}
    settings.write_text(json.dumps({"bookmarks": value}), encoding="utf-8")
    code, out, err = run(
        capsys, "add", "link", "https://example.com/", "--folder", "Nope"
    )
    assert (code, out) == (1, "")
    assert "No folder named 'Nope' in Links" in err
    assert "Create it in the panel first" in err

    value["links"] = [
        {"kind": "folder", "id": "a", "name": "Tools", "children": []},
        {"kind": "folder", "id": "b", "name": "Tools", "children": []},
    ]
    settings.write_text(json.dumps({"bookmarks": value}), encoding="utf-8")
    code, out, err = run(
        capsys, "add", "link", "https://example.com/", "--folder", "Tools"
    )
    assert (code, out) == (1, "")
    assert "More than one folder in Links is named 'Tools'" in err
    assert "Rename one" in err

    for argv, expected in (
        (("add", "link", ""), "URL is empty"),
        (("add", "file", ""), "path is empty"),
        (("add", "session", ""), "command is empty"),
        (("add", "link", "example.com"), "URL has no scheme"),
        (("add", "session", "sleep 1", "--env", "K"), "not KEY=VALUE"),
        (("add", "link", "https://example.com/", "--name", ""), "--name is empty"),
    ):
        code, out, err = run(capsys, *argv)
        assert (code, out) == (2, ""), argv
        assert expected in err, argv


def test_preserves_other_keys(settings, capsys):
    existing = {
        "kind": "link",
        "id": "kept",
        "name": "Kept",
        "url": "https://kept.example/",
    }
    settings.parent.mkdir(parents=True)
    settings.write_text(
        """{
  // Comments and bare keys are JSON5, as the Settings Editor writes them
  sessionEnvExclude: ["FOO_*"],
  markColour: "red",
  bookmarks: {version: 1, links: [{kind: "link", id: "kept", name: "Kept", url: "https://kept.example/"}], files: [], sessions: []},
}
""",
        encoding="utf-8",
    )

    code, out, err = run(capsys, "add", "link", "https://new.example/")
    assert (code, err) == (0, "")

    saved = json.loads(settings.read_text(encoding="utf-8"))
    assert saved["sessionEnvExclude"] == ["FOO_*"]
    assert saved["markColour"] == "red"
    assert saved["bookmarks"]["links"][0] == existing
    assert saved["bookmarks"]["links"][1]["url"] == "https://new.example/"
    # No temporary file stays; the lock file does, because removing it would break the lock.
    assert sorted(entry.name for entry in settings.parent.iterdir()) == [
        settings.name,
        f"{settings.name}.lock",
    ]


def test_skill_and_cli_ship_in_the_package():
    root = Path(__file__).resolve().parents[2]
    skill = root / ".agents" / "skills" / SKILL / "SKILL.md"
    assert skill.is_file()
    assert skill.read_text(encoding="utf-8").count("\n") < 30
    project = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    assert "jupyterlab-bookmarks" in project["project"]["scripts"]
    shared = project["tool"]["hatch"]["build"]["targets"]["wheel"]["shared-data"]
    assert shared[f".agents/skills/{SKILL}"] == f"share/jupyter/agents/skills/{SKILL}"


DECOY = {"port": 9, "base_url": "/", "token": "decoy", "root_dir": "/decoy"}
LAB = {"port": 8889, "base_url": "/lab/", "token": "lab", "root_dir": "/srv/lab"}


def test_a_slow_server_list_is_refused_and_writes_nothing(monkeypatch, capsys, settings):
    """A list that did not answer says nothing about a running lab, so the file stays unwritten."""

    def timed_out(command, **kwargs):
        raise subprocess.TimeoutExpired(command, kwargs["timeout"])

    monkeypatch.setattr(cli.subprocess, "run", timed_out)
    code, out, err = run(capsys, "add", "link", "https://example.com/")
    assert code == 1
    assert out == ""
    assert "jupyter server list" in err
    assert f"{cli.SERVER_LIST_SECONDS} s" in err
    assert not settings.exists()


def test_a_missing_jupyter_command_still_writes_the_file(monkeypatch, capsys, settings):
    """No `jupyter` command means no lab here, so the file is the place."""
    monkeypatch.setenv("PATH", "")
    code, _out, _err = run(capsys, "add", "link", "https://example.com/")
    assert code == 0
    assert [node["url"] for node in bookmarks(settings)["links"]] == ["https://example.com/"]



def test_pick_server(monkeypatch):
    # The first record is a dead decoy: a client that takes the first entry picks port 9.
    monkeypatch.setenv("JUPYTER_SERVER_URL", "http://localhost:8889/lab")
    assert _pick_server([DECOY, LAB]) == LAB

    # JUPYTER_SERVER_URL keeps the configured port, so the record's root_dir must match too.
    monkeypatch.setenv("JUPYTER_SERVER_ROOT", "/srv/lab")
    assert _pick_server([DECOY, LAB]) == LAB
    monkeypatch.setenv("JUPYTER_SERVER_ROOT", "/home/lab/workspace")
    with pytest.raises(Refused) as refused:
        _pick_server([DECOY, LAB])
    assert "JUPYTER_SERVER_ROOT=/home/lab/workspace" in str(refused.value)
    assert "8889/lab/" in str(refused.value)

    monkeypatch.delenv("JUPYTER_SERVER_URL")
    monkeypatch.delenv("JUPYTER_SERVER_ROOT")
    monkeypatch.setenv("JUPYTERHUB_SERVICE_PREFIX", "/lab/")
    assert _pick_server([DECOY, LAB]) == LAB

    monkeypatch.delenv("JUPYTERHUB_SERVICE_PREFIX")
    monkeypatch.setenv("JUPYTER_PORT", "8889")
    assert _pick_server([DECOY, LAB]) == LAB

    # A name matching no record is a refusal that lists the running servers.
    monkeypatch.setenv("JUPYTER_PORT", "9999")
    with pytest.raises(Refused) as refused:
        _pick_server([DECOY, LAB])
    assert "JUPYTER_PORT=9999" in str(refused.value)
    assert "8889/lab/" in str(refused.value)

    # With no name, two token-carrying records are ambiguous.
    monkeypatch.delenv("JUPYTER_PORT")
    with pytest.raises(Refused) as refused:
        _pick_server([DECOY, LAB])
    assert "Cannot tell which running Jupyter server" in str(refused.value)

    # With no name, the one token-carrying record is the lab.
    assert _pick_server([{**DECOY, "token": ""}, LAB]) == LAB


def test_token_order(tmp_path, monkeypatch, capsys):
    stub = StubServer()
    with stub:
        fake_records(
            tmp_path, [{"port": stub.port, "base_url": "/", "token": "record-token"}]
        )
        monkeypatch.setenv("JUPYTER_PORT", str(stub.port))
        monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))

        # The hub token beats the matched record's own.
        monkeypatch.setenv("JUPYTERHUB_API_TOKEN", "hub-token")
        assert run(capsys, "add", "link", "https://example.com/hub")[0] == 0
        assert stub.headers()[-1] == "token hub-token"

        # With no hub token, the record's token beats JUPYTER_TOKEN.
        monkeypatch.delenv("JUPYTERHUB_API_TOKEN")
        monkeypatch.setenv("JUPYTER_TOKEN", "env-token")
        assert run(capsys, "add", "link", "https://example.com/record")[0] == 0
        assert stub.headers()[-1] == "token record-token"
        assert _token({"token": "record-token"}) == "record-token"

        # A record whose token is "" answers "send none"; a stale JUPYTER_TOKEN is not used.
        fake_records(tmp_path, [{"port": stub.port, "base_url": "/", "token": ""}])
        assert run(capsys, "add", "link", "https://example.com/none")[0] == 0
        assert stub.headers()[-1] is None
        assert _token({"token": ""}) is None


def test_api_add(tmp_path, monkeypatch, capsys):
    raw = json.dumps(
        {
            "markColour": "red",
            "bookmarks": {"version": 1, "links": [], "files": [], "sessions": []},
        }
    )
    stub = StubServer(raw)
    with stub:
        fake_records(
            tmp_path,
            [
                {"port": 9, "base_url": "/", "token": "dead"},
                {"port": stub.port, "base_url": "/", "token": "stub-token"},
            ],
        )
        monkeypatch.setenv("JUPYTER_PORT", str(stub.port))
        code, out, err = run(
            capsys, "add", "link", "https://example.com/page", "--name", "Page"
        )

    assert (code, err) == (0, "")
    link_id = out.strip()
    assert out == f"{link_id}\n"

    path = "/lab/api/settings/@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin"
    assert stub.requests[0][:2] == ("GET", path)
    assert stub.requests[0][2] == "token stub-token"
    method, write_path, authorization, body = stub.requests[-1]
    assert (method, write_path) == ("POST", WRITE_ROUTE)
    assert authorization == "token stub-token"
    assert json.loads(body)["base"] == raw

    saved = json.loads(json.loads(body)["raw"])
    assert saved["markColour"] == "red"
    assert saved["bookmarks"]["links"] == [
        {"kind": "link", "id": link_id, "name": "Page", "url": "https://example.com/page"}
    ]


def test_api_errors(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
    for status in (401, 403):
        stub = StubServer(status=status)
        with stub:
            fake_records(
                tmp_path, [{"port": stub.port, "base_url": "/", "token": "stale"}]
            )
            monkeypatch.setenv("JUPYTER_PORT", str(stub.port))
            code, out, err = run(capsys, "add", "link", "https://example.com/")
        assert (code, out) == (1, "")
        assert f"HTTP {status}" in err
        assert "JUPYTERHUB_API_TOKEN" in err and "JUPYTER_TOKEN" in err

    # A named server that does not answer fails, naming its address; no file is written.
    port = free_port()
    fake_records(tmp_path, [{"port": port, "base_url": "/", "token": "t"}])
    monkeypatch.setenv("JUPYTER_PORT", str(port))
    code, out, err = run(capsys, "add", "link", "https://example.com/")
    assert (code, out) == (1, "")
    assert f"127.0.0.1:{port}" in err
    assert not (tmp_path / SCOPED_FOLDER).exists()


def test_api_xsrf(tmp_path, monkeypatch, capsys):
    raw = json.dumps(
        {"bookmarks": {"version": 1, "links": [], "files": [], "sessions": []}}
    )
    stub = StubServer(raw, xsrf="csrf-value")
    with stub:
        fake_records(tmp_path, [{"port": stub.port, "base_url": "/", "token": ""}])
        monkeypatch.setenv("JUPYTER_PORT", str(stub.port))
        monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
        code, out, err = run(capsys, "add", "link", "https://example.com/xsrf")

    assert (code, err) == (0, "")
    link_id = out.strip()
    assert out == f"{link_id}\n"
    assert stub.xsrf_headers == [None, "csrf-value"]
    assert [(request[0], request[1]) for request in stub.requests] == [
        ("GET", "/lab/api/settings/@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin"),
        ("POST", WRITE_ROUTE),
        ("GET", "/"),
        ("POST", WRITE_ROUTE),
    ]
    _method, _path, authorization, body = stub.requests[-1]
    assert authorization is None
    assert body == stub.requests[1][3]
    assert json.loads(json.loads(body)["raw"])["bookmarks"]["links"] == [
        {
            "kind": "link",
            "id": link_id,
            "name": "https://example.com/xsrf",
            "url": "https://example.com/xsrf",
        }
    ]


def test_file_fallback(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
    code, out, err = run(capsys, "add", "file", "notes/todo.md")
    assert (code, err) == (0, "")
    saved = json.loads(
        (tmp_path / SCOPED_FOLDER / "plugin.jupyterlab-settings").read_text(encoding="utf-8")
    )
    assert saved["bookmarks"]["files"] == [
        {
            "kind": "file",
            "id": out.strip(),
            "name": "todo.md",
            "path": "notes/todo.md",
        }
    ]


def test_first_add_starts_from_the_old_file(settings, tmp_path, capsys):
    # The panel keeps a saved value, so an add that saved only its own node would hide these.
    old = tmp_path / "jupyterlab_bookmarks_manager_extension" / "plugin.jupyterlab-settings"
    old.parent.mkdir()
    text = json.dumps(
        {
            "bookmarks": {
                "version": 1,
                "links": [{"kind": "link", "id": "old", "name": "Old", "url": "https://old/"}],
                "files": [],
                "sessions": [],
            }
        }
    )
    old.write_text(f"// Bookmarks\n{text}", encoding="utf-8")

    for name in ("First", "Second"):
        code, _out, err = run(capsys, "add", "link", "https://new/", "--name", name)
        assert (code, err) == (0, "")

    assert [node["name"] for node in bookmarks(settings)["links"]] == ["Old", "First", "Second"]
    assert old.read_text(encoding="utf-8") == f"// Bookmarks\n{text}"


def link_names(raw):
    """The names of the links in the settings text `raw`."""
    return [node["name"] for node in json.loads(raw)["bookmarks"]["links"]]


def named_lab(tmp_path, monkeypatch, stub):
    """Make the stub the lab the command line finds."""
    fake_records(tmp_path, [{"port": stub.port, "base_url": "/", "token": "stub-token"}])
    monkeypatch.setenv("JUPYTER_PORT", str(stub.port))


def test_parallel_runs_with_a_lab_keep_every_bookmark(tmp_path, monkeypatch, capsys):
    real_merge = cli.merge_node

    def other_run_between_read_and_write(settings, node, section, folder):
        monkeypatch.setattr(cli, "merge_node", real_merge)
        assert main(["add", "link", "https://example.com/other", "--name", "Other"]) == 0
        real_merge(settings, node, section, folder)

    stub = StubServer()
    with stub:
        named_lab(tmp_path, monkeypatch, stub)
        monkeypatch.setattr(cli, "merge_node", other_run_between_read_and_write)
        code, _out, err = run(capsys, "add", "link", "https://example.com/mine", "--name", "Mine")

    assert (code, err) == (0, "")
    assert link_names(stub.raw) == ["Other", "Mine"]


def test_parallel_runs_with_no_lab_keep_every_bookmark(settings, monkeypatch):
    fcntl = pytest.importorskip("fcntl")
    codes = {}
    second_stopped = threading.Event()

    def second_run():
        codes["second"] = main(["add", "link", "https://example.com/two", "--name", "Second"])
        second_stopped.set()

    second = threading.Thread(target=second_run)

    # The first run stops between its read and its write until the second run has written, or
    # waits for the lock.
    real_write = cli.write_settings

    def write_after_second_run(path, value):
        if threading.current_thread() is not second:
            second.start()
            second_stopped.wait()
        real_write(path, value)

    real_flock = fcntl.flock

    def flock(lock, operation):
        try:
            real_flock(lock, operation | fcntl.LOCK_NB)
        except BlockingIOError:
            second_stopped.set()
            real_flock(lock, operation)

    monkeypatch.setattr(cli, "write_settings", write_after_second_run)
    monkeypatch.setattr(fcntl, "flock", flock)
    codes["first"] = main(["add", "link", "https://example.com/one", "--name", "First"])
    second.join()

    assert codes == {"first": 0, "second": 0}
    assert link_names(settings.read_text(encoding="utf-8")) == ["First", "Second"]


def test_with_no_file_lock_the_file_is_not_written(settings, monkeypatch, capsys):
    # A Windows Python has no fcntl.
    monkeypatch.setitem(sys.modules, "fcntl", None)
    code, out, err = run(capsys, "add", "link", "https://example.com/")
    assert (code, out) == (1, "")
    assert "Start the lab" in err
    assert not settings.exists()


def test_a_lab_without_the_write_route_says_restart(tmp_path, monkeypatch, capsys):
    stub = StubServer(write_status=404)
    with stub:
        named_lab(tmp_path, monkeypatch, stub)
        monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
        code, out, err = run(capsys, "add", "link", "https://example.com/")

    assert (code, out) == (1, "")
    assert "Restart the Jupyter server" in err
    assert "PUT" not in [request[0] for request in stub.requests]
    assert not (tmp_path / SCOPED_FOLDER).exists()


def test_a_write_refused_every_time_ends_with_an_error(tmp_path, monkeypatch, capsys):
    stub = StubServer(write_status=409)
    with stub:
        named_lab(tmp_path, monkeypatch, stub)
        code, out, err = run(capsys, "add", "link", "https://example.com/")

    assert (code, out) == (1, "")
    assert "run this command again" in err
    assert [request[0] for request in stub.requests].count("POST") == cli.WRITE_ATTEMPTS
