import logging
import signal
import threading
from types import FrameType
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import close_old_connections

from grc.core.outbox.services import drain, revive_dead

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delivers due domain events to their handlers, once or in a loop."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--loop", action="store_true", help="Keep draining until stopped.")
        parser.add_argument("--interval", type=float, default=5.0, help="Seconds between runs.")
        parser.add_argument("--limit", type=int, default=100, help="Deliveries per run.")
        parser.add_argument(
            "--revive-dead",
            action="store_true",
            help="First give dead deliveries a fresh set of attempts, e.g. after a fix.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if options["revive_dead"]:
            logger.info("outbox dead deliveries revived", extra={"deliveries": revive_dead()})
        stop = threading.Event()
        if options["loop"]:
            # A container stop sends SIGTERM: finish the current delivery, then exit.
            def request_stop(signum: int, frame: FrameType | None) -> None:
                stop.set()

            signal.signal(signal.SIGTERM, request_stop)
            signal.signal(signal.SIGINT, request_stop)
        while True:
            ran = drain(options["limit"])
            if ran:
                logger.info("outbox drained", extra={"deliveries": ran})
            if not options["loop"]:
                return
            # Outside the request cycle nothing closes connections, and the pooler gives
            # a connection back only when it closes.
            close_old_connections()
            # A full batch means more is due, so the next run starts at once.
            if stop.wait(0 if ran >= options["limit"] else options["interval"]):
                return
