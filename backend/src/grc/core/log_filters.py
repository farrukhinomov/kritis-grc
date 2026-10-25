import logging

from grc.core.request_context import current_request_id, current_trace_id


class RequestContextFilter(logging.Filter):
    """Adds the request and trace IDs to every log record that lacks them.

    Django logs error responses after the middleware has returned and the per-request
    context is gone, so for those records the IDs are read from the request itself.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        request = vars(record).pop("request", None)
        # The request object is dropped, not serialized: its text form includes the full
        # URL, and query strings can carry tokens or personal data.
        if not hasattr(record, "request_id"):
            record.request_id = getattr(request, "request_id", None) or current_request_id()
        if not hasattr(record, "trace_id"):
            record.trace_id = getattr(request, "trace_id", None) or current_trace_id()
        return True
