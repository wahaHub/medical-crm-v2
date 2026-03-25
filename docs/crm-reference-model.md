# CRM Reference Model

## Purpose

This document defines how CRM resources should reference other CRM resources in `medical-crm-v2`.

It is separate from storage design.

Storage design answers:

- where a file lives
- how it is uploaded
- how it is downloaded securely

Reference design answers:

- how one business object points to another
- how files are reused across modules
- how messages and AI replies should carry structured references

Related document:

- [`crm-media-storage-standard.md`](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/crm-media-storage-standard.md)

## Core Decision

Yes, these should all be referenceable as first-class CRM objects:

- hospital
- package
- uploaded image
- uploaded document
- chatbot FAQ item
- chatbot FAQ attachment
- support ticket attachment
- question collector template
- question collector response, if needed later
- message attachment

This is the right direction because the CRM, admin portal, hospital portal, message system, and AI layer should all speak the same object language.

## Rules

These rules are mandatory.

1. References must point to canonical CRM objects, not free-text URLs.
2. Storage keys are not business references.
3. References must be typed.
4. A referenced object keeps one canonical owner.
5. A referenced object may be reused by many other resources.
6. Access control is enforced when resolving a reference, not when storing the reference.
7. Deleted or archived targets must fail gracefully.

## Canonical Reference Shape

Any cross-module reference should use a typed reference object.

Recommended minimum shape:

```json
{
  "refType": "package",
  "id": "pkg_123",
  "label": "Facial Rejuvenation Package"
}
```

For assets:

```json
{
  "refType": "asset",
  "id": "ast_456",
  "ownerType": "package",
  "ownerId": "pkg_123",
  "label": "cover.jpg"
}
```

Optional later shape with cached display snapshot:

```json
{
  "refType": "faq",
  "id": "faq_123",
  "label": "Visa Requirements",
  "snapshot": {
    "title": "Visa Requirements"
  },
  "version": 3
}
```

Interpretation:

- `id` is canonical
- `label` is display-only convenience
- `snapshot` is optional cached display data
- `version` is optional and only useful if immutable historical rendering matters later

## Direct Reference Is Better Than Copying

Package, photo, file, questionnaire, and hospital should all be directly referenceable.

That is better than:

- copying raw URLs into replies
- copying full object payloads into messages
- embedding storage keys into arbitrary text
- letting AI output become the only place where a relationship exists

Recommended examples:

- a FAQ answer references one or more package ids
- a support reply references one or more asset ids
- a message references a hospital id or package id
- an AI reply stores generated text plus structured references

## Ownership Versus Reuse

There is an important distinction between ownership and reuse.

Recommended rule:

- every uploaded asset has exactly one owner
- any number of other resources may reference that asset

Example:

- a package owns an uploaded image
- the same image may later be referenced by:
  - a FAQ item
  - a support reply
  - a chat message
  - an AI answer

This gives us clear lifecycle control without blocking reuse.

## Storage Keys Are Not References

This object key:

```text
crm/dev/admin/packages/pkg_123/ast_456/cover.jpg
```

is only a storage location.

Application code should reference:

- `assetId`
- `packageId`
- `faqId`
- `hospitalId`
- `questionCollectorTemplateId`

Then resolve:

- metadata from CRM tables
- signed URL from the storage service

This separation is important because storage paths may change later, while business references should remain stable.

## Access Control

A stored reference must never bypass authorization.

Examples:

- a private support attachment may be referenced by a message, but only authorized viewers should get its signed download URL
- an AI reply may mention a package id, but the current user must still have permission to view that package
- a hospital user should not automatically gain access to admin-only references just because a message contains an object id

Rule:

- references are metadata
- permissions are checked when resolving the target

## Deletion And Retention

If an object can be referenced from many places, deletion must be controlled.

Recommended rule set:

1. Do not hard-delete a referenced object immediately.
2. Track reference usage or at least check referencing relations before destructive delete.
3. If the owner is deleted, either block deletion or archive the target.
4. If a reference target is unavailable, render it as unavailable instead of crashing the page or AI thread.

For v2, soft delete or archive is safer than hard delete for:

- packages
- FAQ items
- uploaded assets
- questionnaires
- hospitals, if referenced in conversation history

## Recommended Long-Term Data Model

The clean direction for v2 is:

- each business object keeps its canonical table and id
- uploaded files get their own asset record with owner metadata
- cross-resource references are stored as typed reference JSON or dedicated relation tables where needed

Practical examples:

- `packages` own package asset records
- `support_ticket_replies` store attachment asset ids
- `chatbot_faq_items` store attachment asset ids
- `messages` store typed references such as package ids, faq ids, hospital ids, and asset ids
- AI replies store generated text plus structured references

## Recommended v2 Scope

For the near-term implementation, these are the highest-value reference targets to normalize first:

1. package
2. asset
3. chatbot FAQ item
4. hospital
5. question collector template

This gives enough structure for:

- package linking in FAQ
- attachment reuse in support replies
- object rendering in messages
- grounded AI replies with explicit citations to CRM records

## What This Means For Future Features

If we follow this model:

- a package can be referenced anywhere
- an uploaded photo or document can be referenced anywhere
- a questionnaire can be referenced anywhere
- a hospital can be referenced anywhere

That is the correct design.

The only constraint is that references should go through canonical object ids and typed metadata, not copied URLs or copied blobs.
