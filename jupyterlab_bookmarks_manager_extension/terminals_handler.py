"""GET terminals: the foreground process of every running terminal."""
import json

import tornado
from jupyter_server.base.handlers import APIHandler
from tornado.ioloop import IOLoop

from .process_reader import read_terminal


class TerminalsHandler(APIHandler):
    """Lists name, cwd, command and env of each terminal."""

    @tornado.web.authenticated
    async def get(self) -> None:
        manager = self.settings.get("terminal_manager")
        # Never manager.get_terminal, which creates a terminal that does not exist.
        terminals = dict(manager.terminals) if manager is not None else {}
        loop = IOLoop.current()
        entries = []
        for name, terminal in terminals.items():
            recipe = await loop.run_in_executor(
                None, read_terminal, terminal.ptyproc.pid, terminal.ptyproc.fd
            )
            entries.append({"name": name, **recipe})
        self.finish(json.dumps({"terminals": entries}))
