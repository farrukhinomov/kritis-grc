"""Cross-cutting technical plumbing shared by all business modules.

Nothing here knows about Tenants, Frameworks or Risks: the core must never import a
business module, so it can't become a back door between them.
"""
