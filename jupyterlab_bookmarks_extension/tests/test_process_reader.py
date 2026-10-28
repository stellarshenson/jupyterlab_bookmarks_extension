import importlib
import json
import os
import select
import subprocess
import sys
from pathlib import Path

import pytest

from jupyterlab_bookmarks_extension import process_reader as reader

START = {"bookmark": "b1", "pending": True}


def test_excluded_variables():
    names = ["_", "PWD", "OLDPWD", "SHLVL", "LINES", "COLUMNS", "GITHUB_TOKEN",
             "my_secret", "DB_Password", "PASSWD", "Api_Key", "AWS_CREDENTIALS"]
    process_env = {name: "x" for name in names} | {"K": "v"}
    assert reader.environment_diff({}, process_env) == {"K": "v"}


def test_diff_keeps_added_and_changed_only():
    shell = {"A": "1", "B": "2"}
    assert reader.environment_diff(shell, {"A": "1", "B": "3", "C": "4"}) == {"B": "3", "C": "4"}


def test_kept_names_and_user_variables_survive_a_capture():
    # ACC-SESS-88, server half: a name the setting lists (PATH) is kept here and dropped by the
    # frontend; the built-in names and the secret pattern are dropped here.
    shell_env = {"HOME": "/h", "SHELL": "/bin/bash"}
    process_env = {
        "HOME": "/h", "SHELL": "/bin/bash", "PATH": "/usr/bin", "K": "v",
        "GITHUB_TOKEN": "t",
    }
    assert reader.environment_diff(shell_env, process_env) == {
        "PATH": "/usr/bin", "K": "v"
    }


def test_default_filter_list_is_the_accepted_list_merged():
    # ACC-SESS-88: the accepted 36-entry list of 2026-10-28 merged into 29 expressions.
    schema = json.loads(
        (Path(__file__).parents[2] / "schema" / "plugin.json").read_text(
            encoding="utf-8"
        )
    )
    assert schema["properties"]["sessionEnvExclude"]["default"] == [
        "JUPYTER*", "JPY_*", "PYXTERM_*", "BASH_*", "TERM*", "COLORTERM",
        "LS_COLORS", "HIST*", "PS?", "PROMPT_COMMAND", "HOME", "USER",
        "LOGNAME", "HOSTNAME", "MAIL", "TMUX*", "STY", "SSH_*", "XDG_*",
        "DBUS_*", "DISPLAY", "CONDA_PROMPT_MODIFIER", "CONDA_PREFIX_*",
        "CONDA_*EXE", "_CE_*", "_CONDA_*", "VIRTUAL_ENV_*", "PATH",
        "CUDA_VISIBLE_DEVICES",
    ]


def test_package_imports_without_the_unix_only_modules(monkeypatch):
    # DEF-SESS-10: a Windows Python has no fcntl and termios; the package imports there,
    # and the recording gives an empty command.
    for name in ("fcntl", "termios"):
        monkeypatch.setitem(sys.modules, name, None)
    for name in [n for n in sys.modules if n.split(".")[0] == "jupyterlab_bookmarks_extension"]:
        monkeypatch.delitem(sys.modules, name)
    package = importlib.import_module("jupyterlab_bookmarks_extension")
    recipe = package.process_reader.read_terminal(os.getpid(), 1_000_000)
    assert recipe["command"] == ""
    assert recipe["env"] == {}
    assert recipe["pending"] is False


def test_shell_in_foreground_gives_empty_command(monkeypatch):
    # A live pid: without the shell check its real argv would be recorded.
    shell = os.getpid()
    monkeypatch.setattr(reader.os, "tcgetpgrp", lambda fd: shell)
    monkeypatch.setattr(reader, "_read_cwd", lambda pid: "/work")
    monkeypatch.setattr(reader, "_read_start", lambda pid: START)
    assert reader.read_terminal(shell, 7) == {"cwd": "/work", "command": "", "env": {}, **START}


def test_unreadable_leader_treated_as_shell(monkeypatch):
    def denied(pid):
        raise PermissionError

    monkeypatch.setattr(reader.os, "tcgetpgrp", lambda fd: 99)
    monkeypatch.setattr(reader, "_read_cwd", lambda pid: "/work")
    monkeypatch.setattr(reader, "read_argv", denied)
    monkeypatch.setattr(reader, "_read_start", lambda pid: START)
    assert reader.read_terminal(42, 7) == {"cwd": "/work", "command": "", "env": {}, **START}


def test_command_is_shell_quoted(monkeypatch):
    monkeypatch.setattr(reader.os, "tcgetpgrp", lambda fd: 99)
    monkeypatch.setattr(reader, "_read_cwd", lambda pid: "/work")
    monkeypatch.setattr(reader.os, "readlink", lambda path: "/tmp")
    monkeypatch.setattr(reader, "read_argv", lambda pid: ["echo", "a b"])
    monkeypatch.setattr(
        reader,
        "read_environ",
        lambda pid: {"K": "v", "HOME": "/h", "GITHUB_TOKEN": "x"} if pid == 99 else {"HOME": "/h"},
    )
    monkeypatch.setattr(reader, "_read_start", lambda pid: START)
    assert reader.read_terminal(42, 7) == {
        "cwd": "/tmp", "command": "echo 'a b'", "env": {"K": "v"}, **START
    }


def test_marker_and_unread_input_of_a_real_pty():
    master, slave = os.openpty()
    shell = subprocess.Popen(
        [sys.executable, "-c", "import time; print(flush=True); time.sleep(30)"],
        stdin=slave,
        stdout=subprocess.PIPE,
        env={**os.environ, "JUPYTERLAB_BOOKMARK": "b1"},
    )
    try:
        # Popen can return before the exec ends; the printed line proves the child runs.
        shell.stdout.readline()
        assert reader._read_start(shell.pid) == {"bookmark": "b1", "pending": False}
        os.write(master, b"sleep 300\n")
        # The kernel moves a master write to the slave's input queue asynchronously.
        select.select([slave], [], [], 5)
        assert reader._read_start(shell.pid) == {"bookmark": "b1", "pending": True}
        os.read(slave, 64)
        assert reader._read_start(shell.pid) == {"bookmark": "b1", "pending": False}
    finally:
        shell.kill()
        shell.wait()
        shell.stdout.close()
        os.close(master)
        os.close(slave)
