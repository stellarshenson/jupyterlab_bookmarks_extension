"""GET terminals: the foreground process of every running terminal. POST terminals: type a line."""
import json

import tornado
from jupyter_server.auth.decorator import authorized
from jupyter_server.base.handlers import APIHandler
from tornado.ioloop import IOLoop

from .process_reader import read_terminal


class TerminalsHandler(APIHandler):
    """Lists name, cwd, command and env of each terminal, and types a line into one."""

    @tornado.web.authenticated
    async def get(self) -> None:
        manager = self.settings.get("terminal_manager")
        # Never manager.get_terminal, which creates a terminal that does not exist.
        terminals = dict(manager.terminals) if manager is not None else {}
        loop = IOLoop.current()
        entries = []
        for name, terminal in terminals.items():
            # Read before the pty: a line POST writes during the read then counts as unread or as not typed.
            typed = getattr(terminal, "line_typed", False)
            recipe = await loop.run_in_executor(
                None, read_terminal, terminal.ptyproc.pid, terminal.ptyproc.fd
            )
            # A bookmark's terminal waits for its line from the page that started it.
            if recipe["bookmark"] and not typed:
                recipe["pending"] = True
            entries.append({"name": name, **recipe})
        self.finish(json.dumps({"terminals": entries}))

    @tornado.web.authenticated
    @authorized("execute", "terminals")
    def post(self) -> None:
        """Write `line` to the pty of terminal `name`; the 204 says that the line is on the pty.

        A terminal's socket gives no such answer, so a bookmark's start types its recipe here. The
        input is the socket's, so this asks for the permission the socket asks for.
        """
        try:
            body = json.loads(self.request.body)
            name, line = body["name"], body["line"]
        except (ValueError, KeyError, TypeError):
            raise tornado.web.HTTPError(400, "Body must be JSON with name and line")
        if not isinstance(name, str) or not isinstance(line, str):
            raise tornado.web.HTTPError(400, "name and line must be strings")
        manager = self.settings.get("terminal_manager")
        terminal = manager.terminals.get(name) if manager is not None else None
        if terminal is None:
            raise tornado.web.HTTPError(404, f"No running terminal named {name}")
        terminal.ptyproc.write(line)
        terminal.line_typed = True
        self.set_status(204)
        self.finish()
