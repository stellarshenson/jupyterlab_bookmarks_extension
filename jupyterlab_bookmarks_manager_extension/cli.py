"""`jupyterlab-bookmarks`: add a bookmark through the running lab's settings API, or write the
panel's settings file when no lab is found."""
import argparse
import http.cookiejar
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

import json5
from jupyter_core.paths import jupyter_config_dir

from .old_settings import read_old_settings

# The file jupyterlab_server reads and writes for the panel's plugin id.
SETTINGS_PATH = Path(
    "@stellarshenson/jupyterlab-bookmarks-manager-extension", "plugin.jupyterlab-settings"
)

# The running lab's settings API for that plugin, appended to the lab's base URL.
SETTINGS_API = "/lab/api/settings/@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin"

# The section each kind of bookmark lives in, and the section's title in the panel.
SECTIONS = {"link": "links", "file": "files", "session": "sessions"}
TITLES = {"links": "Links", "files": "Files", "sessions": "Sessions"}

DEFAULT_SETTINGS_DIR = Path(jupyter_config_dir(), "lab", "user-settings")

# One opener for every request, so a Set-Cookie from the lab's base page survives to the next
# request; the tokenless `_xsrf` handshake reads that cookie.
_COOKIES = http.cookiejar.CookieJar()
_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(_COOKIES)
)


class Refused(Exception):
    """The bookmark cannot be added; the message names the next step. Exit code 1."""


class UsageError(Exception):
    """The arguments are incomplete or malformed; the message names the next step. Exit code 2."""


EPILOG = f"""\
The panel shows a bookmark added here at its next save or after a page reload;
nothing watches the settings file.

environment:
  JUPYTER_SERVER_URL         the lab's address, as a JupyterLab terminal sets it
  JUPYTER_SERVER_ROOT        the lab's root directory, checked with JUPYTER_SERVER_URL
  JUPYTERHUB_SERVICE_PREFIX  the lab's base URL path under JupyterHub
  JUPYTER_PORT               the lab's port
  JUPYTERHUB_API_TOKEN       the token JupyterHub issued; it comes first
  JPY_API_TOKEN              the token JupyterHub issued, older name
  JUPYTER_TOKEN              the lab's own token, when the environment names no lab
  JUPYTERLAB_SETTINGS_DIR    the settings folder, written only when no lab is found
                             (default: {DEFAULT_SETTINGS_DIR})

exit codes:
  0  added; the new id is the only line on stdout
  1  refused or failed: no single running lab named, the lab answered 401, 403,
     404 or 500, or the settings are not JSON5
  2  usage: an empty URL, path, command or name, or a malformed --env
"""

LINK_EPILOG = """\
examples:
  jupyterlab-bookmarks add link https://docs.python.org/
  jupyterlab-bookmarks add link /lab/tree/README.md --name "Project README" --folder Docs
"""

FILE_EPILOG = """\
examples:
  jupyterlab-bookmarks add file notebooks/report.ipynb
  jupyterlab-bookmarks add file data/raw.csv --folder Data
"""

SESSION_EPILOG = """\
examples:
  jupyterlab-bookmarks add session "jupyter lab"
  jupyterlab-bookmarks add session "python train.py" --cwd ~/work --env CUDA_VISIBLE_DEVICES=0
"""


def settings_dir() -> Path:
    """JupyterLab's user-settings folder, for the current environment."""
    return Path(os.environ.get("JUPYTERLAB_SETTINGS_DIR") or DEFAULT_SETTINGS_DIR)


def settings_file() -> Path:
    """The settings file the panel of a lab reads, for the current environment."""
    return settings_dir() / SETTINGS_PATH


def parse_settings(text: str, source: str) -> dict:
    """Parse settings text as JSON5; a value that is not an object is refused."""
    try:
        settings = json5.loads(text)
    except ValueError as error:
        raise Refused(
            f"{source} is not valid JSON5 ({error}). Open the Settings Editor once and save, "
            "which rewrites the file as JSON, then run this command again."
        ) from error
    if not isinstance(settings, dict):
        raise Refused(
            f"{source} does not hold a settings object. Open the Settings Editor once and save, "
            "which rewrites the file as JSON, then run this command again."
        )
    return settings


def read_settings(path: Path) -> dict:
    """Parse the settings file as JSON5; a missing file is an empty setting."""
    if not path.exists():
        return {}
    return parse_settings(path.read_text(encoding="utf-8"), str(path))


def bookmarks_setting(settings: dict) -> dict:
    """The `bookmarks` value, created or completed to the shape the panel stores.

    With nothing saved it starts from the file of the old npm name: the panel keeps a saved value,
    so a first add before the first page load would otherwise hide those bookmarks for good.
    """
    value = settings.get("bookmarks")
    if value is None:
        value = read_old_settings(settings_dir()).get("bookmarks")
    if value is None:
        return {"version": 1, "links": [], "files": [], "sessions": []}
    if not isinstance(value, dict) or any(
        not isinstance(value.get(name), list) for name in TITLES
    ):
        raise Refused(
            "The `bookmarks` setting is not the shape the panel stores. Open the Settings "
            "Editor once and save, then run this command again."
        )
    if "version" not in value:
        value["version"] = 1
    return value


def destination(bookmarks: dict, section: str, folder: str | None) -> list:
    """The list that receives the new node: the section root or the folder's children."""
    nodes = bookmarks[section]
    if folder is None:
        return nodes
    matches = [
        node
        for node in nodes
        if isinstance(node, dict) and node.get("kind") == "folder" and node.get("name") == folder
    ]
    title = TITLES[section]
    if not matches:
        raise Refused(
            f"No folder named {folder!r} in {title}. Create it in the panel first, "
            "then run this command again."
        )
    if len(matches) > 1:
        raise Refused(
            f"More than one folder in {title} is named {folder!r}. Rename one in the panel, "
            "then run this command again."
        )
    return matches[0]["children"]


def merge_node(settings: dict, node: dict, section: str, folder: str | None) -> None:
    """Append `node` to the section or the folder's children; every other key is kept."""
    bookmarks = bookmarks_setting(settings)
    destination(bookmarks, section, folder).append(node)
    settings["bookmarks"] = bookmarks


def parse_env(pairs: list[str]) -> dict[str, str]:
    """The `--env` pairs as a mapping; a pair without `=` or with an empty key is usage."""
    env = {}
    for pair in pairs:
        key, separator, value = pair.partition("=")
        if not separator or not key:
            raise UsageError(
                f"--env {pair!r} is not KEY=VALUE. Pass it as NAME=value, "
                "for example --env PATH=/opt/tool/bin."
            )
        env[key] = value
    return env


def settings_text(settings: dict) -> str:
    """The settings text both transports carry: plain JSON, two-space indent, final newline."""
    return json.dumps(settings, indent=2, ensure_ascii=False) + "\n"


def write_settings(path: Path, settings: dict) -> None:
    """Write the settings text to `path` through a temporary file in the same folder."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(settings_text(settings))
            os.replace(temporary, path)
        except OSError:
            Path(temporary).unlink(missing_ok=True)
            raise
    except OSError as error:
        raise Refused(
            f"Cannot write {path} ({error}). Check that the folder is writable, "
            "then run this command again."
        ) from error


def _server_list() -> list[dict]:
    """Every running Jupyter server's record; a missing `jupyter` or a timeout gives none."""
    try:
        result = subprocess.run(
            ["jupyter", "server", "list", "--json"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    records = []
    for line in result.stdout.splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _pick_server(records: list[dict]) -> dict:
    """The lab's record among every running server's record; {} when none is running.

    The environment names the lab: JUPYTER_SERVER_URL's port and base URL path first, with
    the record's `root_dir` equal to JUPYTER_SERVER_ROOT when that is set, else
    JUPYTERHUB_SERVICE_PREFIX, else JUPYTER_PORT. Only a matching record is used: the list's
    order carries no meaning and a test server can hold the lab's usual port.
    With no variable set, the one record carrying a token is used; the refusal lists the
    servers so the caller can name the right one.
    """
    if not records:
        return {}

    def path(value: object) -> str:
        return str(value).rstrip("/") or "/"

    def with_token(matches: list[dict]) -> dict:
        return next((record for record in matches if record.get("token")), matches[0])

    running = ", ".join(
        f"{record.get('port')}{record.get('base_url', '/')}"
        + ("" if record.get("token") else " (no token)")
        for record in records
    )

    named = None
    server_url = os.environ.get("JUPYTER_SERVER_URL", "")
    if server_url:
        try:
            parsed = urllib.parse.urlsplit(server_url)
            parsed_port = parsed.port
        except ValueError:
            parsed, parsed_port = None, None
        if parsed_port is not None:
            named = (
                f"JUPYTER_SERVER_URL={server_url}",
                [
                    record
                    for record in records
                    if record.get("port") == parsed_port
                    and path(record.get("base_url", "")) == path(parsed.path)
                ],
            )
            root = os.environ.get("JUPYTER_SERVER_ROOT", "")
            if root:
                named = (
                    f"{named[0]} with JUPYTER_SERVER_ROOT={root}",
                    [
                        record
                        for record in named[1]
                        if os.path.abspath(str(record.get("root_dir", "")))
                        == os.path.abspath(root)
                    ],
                )
    if named is None and (prefix := os.environ.get("JUPYTERHUB_SERVICE_PREFIX", "")):
        named = (
            f"JUPYTERHUB_SERVICE_PREFIX={prefix}",
            [
                record
                for record in records
                if path(record.get("base_url", "")) == path(prefix)
            ],
        )
    if named is None and (port := os.environ.get("JUPYTER_PORT", "")):
        named = (
            f"JUPYTER_PORT={port}",
            [record for record in records if str(record.get("port")) == port.strip()],
        )

    if named is not None:
        variable, matches = named
        if matches:
            return with_token(matches)
        raise Refused(
            f"No running Jupyter server matches {variable}. Start the lab, or run this "
            f"command in a JupyterLab terminal. Running: {running}"
        )

    token_records = [record for record in records if record.get("token")]
    if len(token_records) == 1:
        return token_records[0]
    raise Refused(
        "Cannot tell which running Jupyter server is the lab. Run this command in a "
        f"JupyterLab terminal, or set JUPYTER_PORT to the lab's port. Running: {running}"
    )


def _base_url(info: dict) -> str:
    """Where the lab answers on loopback; "" when nothing names a server, so the file is written."""
    if info:
        scheme = "https" if info.get("secure") else "http"
        base = str(info.get("base_url") or "/").rstrip("/")
        return f"{scheme}://127.0.0.1:{info.get('port', 8888)}{base}"
    port = os.environ.get("JUPYTER_PORT", "")
    prefix = os.environ.get("JUPYTERHUB_SERVICE_PREFIX", "")
    if not port and not prefix:
        return ""
    return f"http://127.0.0.1:{port or 8888}{prefix.rstrip('/')}"


def _token(info: dict) -> str | None:
    """The token that authenticates to the named lab.

    JupyterHub's token comes first: under JupyterHub the server's own record token is not
    accepted, only the hub-issued one. The matched record's token comes next; `in`, not
    truthiness, so a record reporting "" answers "send none" instead of falling through to
    a stale JUPYTER_TOKEN. JUPYTER_TOKEN is the last resort.
    """
    hub = os.environ.get("JUPYTERHUB_API_TOKEN") or os.environ.get("JPY_API_TOKEN")
    if hub:
        return hub
    if "token" in info:
        return info["token"] or None
    return os.environ.get("JUPYTER_TOKEN") or None


def running_lab() -> tuple[str, str | None] | None:
    """The running lab's address and token; None when nothing names a server (write the file)."""
    info = _pick_server(_server_list())
    address = _base_url(info)
    if not address:
        return None
    return address, _token(info)


def _api_failure(status: int, address: str) -> Refused:
    """The refusal for a failed settings API answer, naming the cause and the next step."""
    if status in (401, 403):
        return Refused(
            f"The lab at {address} refused the token (HTTP {status}). Set JUPYTERHUB_API_TOKEN "
            "or JPY_API_TOKEN to the token JupyterHub issued, or JUPYTER_TOKEN to the lab's "
            "token, then run this command again."
        )
    if status == 404:
        return Refused(
            f"The lab at {address} does not serve the bookmarks settings (HTTP 404). Check that "
            "the lab runs JupyterLab 4 with jupyterlab_bookmarks_manager_extension installed and "
            "enabled, then run this command again."
        )
    if status == 500:
        return Refused(
            f"The lab at {address} could not handle the settings text (HTTP 500). Open the "
            "Settings Editor once and save, which rewrites the file as JSON, then run this "
            "command again."
        )
    return Refused(
        f"The lab at {address} answered HTTP {status}. Check the lab's log, then run this "
        "command again."
    )


def _api(
    address: str,
    token: str | None,
    method: str = "GET",
    payload: bytes | None = None,
    xsrf: str | None = None,
) -> tuple[int, bytes]:
    """One request to the lab's settings API; the token and `_xsrf` travel in headers only."""
    request = urllib.request.Request(address + SETTINGS_API, data=payload, method=method)
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"token {token}")
    if xsrf:
        request.add_header("X-XSRFToken", xsrf)
    try:
        with _OPENER.open(request, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except (urllib.error.URLError, OSError) as error:
        reason = getattr(error, "reason", error)
        raise Refused(
            f"Cannot reach the lab at {address} ({reason}). Start the lab, or correct "
            "JUPYTER_SERVER_URL, JUPYTERHUB_SERVICE_PREFIX or JUPYTER_PORT, then run this "
            "command again."
        ) from error


def _xsrf(address: str) -> str | None:
    """The `_xsrf` cookie the lab's base page sets; None when it sets none.

    A lab started without a token accepts a PUT only when that value comes back in the
    `X-XSRFToken` header, and the cookie arrives with the base page.
    """
    try:
        with _OPENER.open(address + "/", timeout=10) as response:
            response.read()
    except (urllib.error.URLError, OSError):
        return None
    return next((cookie.value for cookie in _COOKIES if cookie.name == "_xsrf"), None)


def api_get(address: str, token: str | None) -> dict:
    """The lab's settings for the panel's plugin, parsed from the raw text it keeps."""
    status, body = _api(address, token)
    if not 200 <= status < 300:
        raise _api_failure(status, address)
    try:
        answer = json.loads(body)
    except ValueError:
        answer = None
    raw = answer.get("raw") if isinstance(answer, dict) else None
    if not isinstance(raw, str):
        raise Refused(
            f"The lab at {address} did not answer with the settings text. Check that "
            "jupyterlab_bookmarks_manager_extension is installed and enabled in that lab, then run "
            "this command again."
        )
    return parse_settings(raw, f"The settings text the lab at {address} returned")


def api_put(address: str, token: str | None, text: str) -> None:
    """Save the settings text through the lab's settings API; any 2xx answer is saved.

    A lab started without a token answers the first PUT 403 until the `_xsrf` cookie it set
    comes back in `X-XSRFToken`, so that refusal is answered by reading the base page and
    sending the same PUT once more.
    """
    payload = json.dumps({"raw": text}).encode("utf-8")
    status, _body = _api(address, token, "PUT", payload)
    if status == 403 and token is None:
        xsrf = _xsrf(address)
        if xsrf is not None:
            status, _body = _api(address, token, "PUT", payload, xsrf)
    if not 200 <= status < 300:
        raise _api_failure(status, address)


def add(args: argparse.Namespace) -> str:
    """Add the bookmark the arguments describe and return its new id."""
    if args.name == "":
        raise UsageError("--name is empty. Pass a name, or leave --name out to use the default.")

    if args.kind == "link":
        if not args.url:
            raise UsageError(
                "The URL is empty. Pass the address to bookmark, for example "
                "`jupyterlab-bookmarks add link https://example.com`."
            )
        if not urlparse(args.url).scheme and not args.url.startswith("/"):
            raise UsageError(
                "The URL has no scheme. Add https:// in front of it, or start it with / "
                "for a page on the lab's own server."
            )
        name = args.name if args.name is not None else args.url
        body = {"url": args.url}
    elif args.kind == "file":
        if not args.path:
            raise UsageError(
                "The path is empty. Pass the file's path, relative to the Jupyter server root."
            )
        name = args.name if args.name is not None else os.path.basename(args.path.rstrip("/"))
        body = {"path": args.path}
    else:
        if not args.command:
            raise UsageError(
                "The command is empty. Pass the command the terminal runs, for example "
                "`jupyterlab-bookmarks add session \"jupyter lab\"`."
            )
        name = args.name if args.name is not None else args.command
        body = {
            "cwd": args.cwd or os.getcwd(),
            "command": args.command,
            "env": parse_env(args.env),
        }

    section = SECTIONS[args.kind]
    node = {"kind": args.kind, "id": str(uuid.uuid4()), "name": name, **body}
    lab = running_lab()
    if lab is None:
        path = settings_file()
        settings = read_settings(path)
        merge_node(settings, node, section, args.folder)
        write_settings(path, settings)
    else:
        address, token = lab
        settings = api_get(address, token)
        merge_node(settings, node, section, args.folder)
        api_put(address, token, settings_text(settings))
    return node["id"]


def _add_common(parser: argparse.ArgumentParser) -> None:
    """The flags every kind of `add` carries."""
    parser.add_argument(
        "--name", help="The bookmark's name (default: the URL, the file name or the command)"
    )
    parser.add_argument(
        "--folder", help="An existing folder of the section (default: the section root)"
    )


def build_parser() -> argparse.ArgumentParser:
    """The command line's argument parser."""
    parser = argparse.ArgumentParser(
        prog="jupyterlab-bookmarks",
        description=(
            "Add a bookmark to the Bookmarks panel through the running lab's settings API, "
            "or by writing the local settings file when no lab is found."
        ),
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    add_parser = commands.add_parser("add", help="Add a link, a file or a session bookmark")
    kinds = add_parser.add_subparsers(dest="kind", required=True, metavar="KIND")

    link = kinds.add_parser(
        "link",
        help="Add a web page",
        epilog=LINK_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    link.add_argument(
        "url",
        help="The page's address: https://... for another origin, or /path for a page on the lab's own server",
    )
    _add_common(link)

    file_parser = kinds.add_parser(
        "file",
        help="Add a file",
        epilog=FILE_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    file_parser.add_argument(
        "path", help="The file's path, relative to the Jupyter server root; stored as typed"
    )
    _add_common(file_parser)

    session = kinds.add_parser(
        "session",
        help="Add a terminal session recipe",
        epilog=SESSION_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    session.add_argument("command", help="The command the terminal runs")
    _add_common(session)
    session.add_argument(
        "--cwd", help="The working directory (default: the current directory)"
    )
    session.add_argument(
        "--env",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="An environment variable to export on start; repeat for more",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the command line and return its exit code."""
    args = build_parser().parse_args(argv)
    try:
        new_id = add(args)
    except UsageError as error:
        print(error, file=sys.stderr)
        return 2
    except Refused as error:
        print(error, file=sys.stderr)
        return 1
    print(new_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
