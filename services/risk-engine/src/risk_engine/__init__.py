"""Stateless risk calculation service.

It holds no data and opens no database connection: every request carries everything
needed to compute the answer, so the service can be scaled, restarted or replaced freely.
"""
