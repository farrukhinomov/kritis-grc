# GRC Platform

A multi-tenant governance, risk and compliance platform, starting with the KRITIS-Dachgesetz framework and its mapping to NIS2 as implemented in the German BSIG.

## Organization

**Tenant**:
An organization whose compliance data is fully isolated from every other organization on the platform.
_Avoid_: Mandant (in code), client, customer, account

**Scope**:
A part of a Tenant, such as a site, business unit or single Critical Facility, that requirements and risks apply to. A Scope never spans more than one Tenant.
_Avoid_: area, segment, unit

**Theme**:
The visual branding a Tenant chooses for everyone in it, such as Saar Green, Blue or High Contrast. Each user separately picks light, dark or system mode.
_Avoid_: skin, style, design

**Demo Tenant**:
A Tenant pre-filled with realistic sample data, open to the public through demo logins and restored to its original state every night.
_Avoid_: sandbox, test tenant

## Roles

**Membership**:
A user's access to one Tenant, with exactly one role and optionally limited to certain Scopes. A user can hold Memberships in several Tenants.
_Avoid_: tenant user, assignment

**GRC Manager**:
A role in a Membership that can create, change and approve compliance data.
_Avoid_: admin, editor

**Auditor**:
A role in a Membership that can read compliance data but not change it.
_Avoid_: viewer, read-only user

**API Token**:
A secret that lets a program act on behalf of one Membership, read-only or read-write, until it expires or is revoked. It never has more rights than its Membership.
_Avoid_: API key, access key, PAT

**Platform Admin**:
A person operating the platform itself, who creates Tenants and curates Platform Mappings, outside any Tenant.
_Avoid_: superuser, admin (unqualified)

## Critical infrastructure

**Critical Facility**:
A Scope that the law classifies as a kritische Anlage: a facility significant for providing a Critical Service, with its own Registration and legal deadlines.
_Avoid_: KRITIS-Anlage (in code), critical asset, critical infrastructure (as a single object)

**Sector**:
One of the areas of society the law names as critical, such as Wasser or Energie, to which a Critical Facility belongs.
_Avoid_: industry, branch

**Critical Service**:
The service a Critical Facility provides to the population, such as drinking water supply, measured against a legal threshold like the number of people supplied.
_Avoid_: kritische Dienstleistung (in code), business service

**Applicability Check**:
A guided check of whether an organization operates a Critical Facility, based on Sector, Critical Service and threshold. A positive result creates a Critical Facility with a planned Registration.
_Avoid_: Betroffenheitsprüfung (in code), onboarding wizard, KRITIS test

**Asset**:
Anything a Scope depends on to deliver its service, such as a pump, control system, building or supplier, including its dependencies on other Assets.
_Avoid_: resource, component, item

**Registration**:
The notification of a Critical Facility to the authority, either planned (an expected date, giving projected deadlines) or confirmed (the date the authority confirmed, giving binding deadlines).
_Avoid_: Registrierung (in code), sign-up, enrolment

## Compliance

**Framework**:
A body of requirements an organization must or wants to meet, such as KRITIS-Dachgesetz or NIS2 (BSIG 2025).
_Avoid_: standard, norm, regulation (as the generic term)

**Framework Version**:
One fixed edition of a Framework's requirements, such as the KRITIS-Dachgesetz as amended in July 2026. Every Implementation belongs to exactly one Framework Version.
_Avoid_: revision, release

**Requirement**:
A single obligation within a Framework Version, such as one paragraph or control.
_Avoid_: control, Anforderung (in code)

**Pending Legal Detail**:
A marker on a Requirement whose content is fixed in law but whose specifics still await an ordinance or official template.
_Avoid_: draft requirement, TBD

**Mapping**:
A directional statement that a target Requirement is fully or partly covered by a source Requirement in another Framework. A Mapping never changes an Implementation's status by itself.
_Avoid_: cross-reference, link, equivalence

**Platform Mapping**:
A Mapping curated by the Platform Admin with a legal justification, visible to and read-only for every Tenant.

**Tenant Mapping**:
A Mapping that applies to one Tenant only, valid once that Tenant's GRC Manager approves it.

**Mapping Suggestion**:
A proposed Tenant Mapping produced by the AI, waiting for a GRC Manager to approve or reject it.
_Avoid_: AI mapping, recommendation

**Implementation**:
One Requirement applied to one Scope, with a status of open, partial, implemented or not applicable. Evidence attaches to an Implementation, never directly to a Requirement.
_Avoid_: Umsetzung (in code), control instance, measure

**Evidence**:
Proof that an Implementation is in place. Evidence is a File, a Link or a Reference.
_Avoid_: proof, attachment, Nachweis (in code)

**File Evidence**:
Evidence consisting of an uploaded document, such as a PDF or screenshot.

**Link Evidence**:
Evidence consisting of a URL pointing to content outside the platform.

**Reference Evidence**:
Evidence that points to another Implementation in the same Scope, typically from a different Framework, so one piece of work counts toward several Frameworks.
_Avoid_: cross-reference, mapping (a mapping relates requirements, not evidence)

**Resilience Plan**:
The document a Critical Facility keeps to describe its resilience measures, why they were chosen, and how they follow from the Risk Assessment.
_Avoid_: Resilienzplan (in code), emergency plan, BCM plan

**Audit**:
A planned review that checks whether a Tenant's requirements are actually implemented and operating.
_Avoid_: using "audit" for change tracking (that is the Activity Log)

**Activity Log**:
The permanent, unchangeable record of who changed which compliance data in a Tenant, when, and from which value to which value.
_Avoid_: audit log, audit trail, history

## Risk

**Hazard**:
A kind of event that could disrupt a Critical Service, natural, technical or human-made, such as flooding, power outage or sabotage.
_Avoid_: threat (reserved for cyber context), Gefahr (in code), danger

**Risk**:
One Hazard affecting one Critical Facility, optionally through specific Assets.
_Avoid_: issue, finding

**Inherent Rating**:
A Risk's likelihood and impact before any Treatment, set by a person.

**Target Rating**:
The likelihood and impact a Risk should reach, set by a person.

**Residual Rating**:
A Risk's current likelihood and impact, calculated from the Inherent Rating and the effects of its Treatments whose Implementations are in place.
_Avoid_: current risk, net risk

**Treatment**:
A link from a Risk to an Implementation, stating which dimension (likelihood or impact) it lowers and by how many levels.
_Avoid_: Maßnahme (in code), measure, control

**Risk Assessment**:
A dated, approved review of all Risks of one Critical Facility. The law requires one at least every four years.
_Avoid_: risk analysis, Risikoanalyse (in code)

**Incident**:
An actual event that has disrupted, or could significantly disrupt, a Critical Service. It may require reports under several Frameworks at once.
_Avoid_: Vorfall (in code), outage, ticket
