"""Read the foreground process of a terminal from /proc (Linux only)."""
import os
import re
import shlex
import struct

EXCLUDED_NAMES = frozenset({"_", "PWD", "OLDPWD", "SHLVL", "LINES", "COLUMNS"})
EXCLUDED_PATTERN = re.compile(
    "TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|CREDENTIAL", re.IGNORECASE
)


def is_excluded(name: str) -> bool:
    """Tell whether a variable name must never be recorded."""
    return name in EXCLUDED_NAMES or EXCLUDED_PATTERN.search(name) is not None


def read_environ(pid: int) -> dict[str, str]:
    """Read the environment a process started with.

    Raises:
        OSError: the process is gone or belongs to another user.
    """
    with open(f"/proc/{pid}/environ", "rb") as handle:
        entries = handle.read().decode(errors="replace").split("\0")
    return dict(entry.split("=", 1) for entry in entries if "=" in entry)


def read_argv(pid: int) -> list[str]:
    """Read the argument vector of a process.

    Raises:
        OSError: the process is gone or belongs to another user.
    """
    with open(f"/proc/{pid}/cmdline", "rb") as handle:
        return handle.read().decode(errors="replace").rstrip("\0").split("\0")


def environment_diff(
    shell_env: dict[str, str], process_env: dict[str, str]
) -> dict[str, str]:
    """Return the variables the process added or changed, without excluded names."""
    return {
        name: value
        for name, value in process_env.items()
        if shell_env.get(name) != value and not is_excluded(name)
    }


def read_terminal(terminal_pid: int, fd: int, start_env: dict[str, str]) -> dict:
    """Describe what runs in the foreground of a terminal.

    Args:
        terminal_pid: pid of the terminal's own process, its shell or a program.
        fd: file descriptor of the pty master.
        start_env: the environment a new terminal of the lab starts with.

    Returns:
        A dict with `cwd`, `command` (shell-quoted), `env`, `shell`, `bookmark`
        and `pending` (see _read_start). `shell` is true only when the terminal's
        own process is in the foreground and runs a shell that /etc/shells lists;
        it then has an empty command and env. A program that is the terminal's own
        process has its env compared with `start_env`, as no shell is above it. A
        foreground process that cannot be read gives an empty command and env,
        `shell` false and the terminal process's cwd.
    """
    own_cwd = _read_cwd(terminal_pid)
    start = _read_start(terminal_pid)
    try:
        pgid = os.tcgetpgrp(fd)
        if pgid == terminal_pid and _runs_shell(pgid):
            return {"cwd": own_cwd, "command": "", "env": {}, "shell": True, **start}
        argv = read_argv(pgid)
        cwd = os.readlink(f"/proc/{pgid}/cwd")
        base = start_env if pgid == terminal_pid else read_environ(terminal_pid)
        env = environment_diff(base, read_environ(pgid))
    except (AttributeError, OSError):
        return {"cwd": own_cwd, "command": "", "env": {}, "shell": False, **start}
    return {"cwd": cwd, "command": shlex.join(argv), "env": env, "shell": False, **start}


def _runs_shell(pid: int) -> bool:
    """Tell whether the process runs a shell that /etc/shells lists.

    Raises:
        OSError: the process is gone or belongs to another user.
    """
    exe = os.readlink(f"/proc/{pid}/exe")
    with open("/etc/shells", encoding="utf-8") as handle:
        # The file lists /bin/sh and the like; /proc gives the binary's real path.
        return any(
            os.path.realpath(line.strip()) == exe for line in handle if line.startswith("/")
        )


def _read_cwd(pid: int) -> str:
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return ""


def _read_start(pid: int) -> dict:
    """The session bookmark that started the shell (`JUPYTERLAB_BOOKMARK`) and
    whether typed input waits unread on its pty (`pending`): the recipe line
    a click sent before the shell was ready."""
    try:
        bookmark = read_environ(pid).get("JUPYTERLAB_BOOKMARK", "")
    except OSError:
        bookmark = ""
    try:
        # fcntl and termios are Unix-only; without them the package still imports
        # and no unread input is recorded (DEF-SESS-10-WINDOWS-IMPORT).
        import fcntl
        import termios
    except ImportError:
        return {"bookmark": bookmark, "pending": False}
    try:
        stdin = os.open(f"/proc/{pid}/fd/0", os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            unread = fcntl.ioctl(stdin, termios.FIONREAD, b"\0" * 4)
        finally:
            os.close(stdin)
        pending = struct.unpack("i", unread)[0] > 0
    except (AttributeError, OSError):
        pending = False
    return {"bookmark": bookmark, "pending": pending}
