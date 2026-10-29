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


def read_terminal(shell_pid: int, fd: int) -> dict:
    """Describe what runs in the foreground of a terminal.

    Args:
        shell_pid: pid of the terminal's shell.
        fd: file descriptor of the pty master.

    Returns:
        A dict with `cwd`, `command` (shell-quoted), `env`, `bookmark` and
        `pending` (see _read_start). A shell in the foreground, or a foreground
        process that cannot be read, gives an empty command and env and the
        shell's cwd.
    """
    shell_cwd = _read_cwd(shell_pid)
    start = _read_start(shell_pid)
    try:
        pgid = os.tcgetpgrp(fd)
        if pgid == shell_pid:
            return {"cwd": shell_cwd, "command": "", "env": {}, **start}
        argv = read_argv(pgid)
        cwd = os.readlink(f"/proc/{pgid}/cwd")
        env = environment_diff(read_environ(shell_pid), read_environ(pgid))
    except (AttributeError, OSError):
        return {"cwd": shell_cwd, "command": "", "env": {}, **start}
    return {"cwd": cwd, "command": shlex.join(argv), "env": env, **start}


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
