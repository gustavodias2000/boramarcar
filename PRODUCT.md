# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the user: Next.js with TypeScript and the Supabase JavaScript client. This repository had no frontend scaffold when the Automotive interface was requested.

## Users

Owners, managers, reception staff, cashiers and technicians of service businesses. The first interface serves Automotive teams working at the reception desk and in the pátio during an active service day.

## Product Purpose

Bora Marcá is a multi-company SaaS for service businesses. In Automotive, it helps the team receive vehicles, execute and charge for Orders of Service, monitor the Pátio and deliver vehicles without losing operational context.

## Positioning

The product connects transactional scheduling with the physical operation: a professional or box cannot be promised to two jobs at once, and an active OS becomes the source of truth for the Pátio.

## Operating Context

The Automotive workflow starts with a scheduled or walk-in vehicle entry, then moves through service, payment and delivery. Teams need to identify the vehicle, customer, technician, box, value and next action at a glance. Photos are private evidence associated with the OS.

## Capabilities and Constraints

- Supabase PostgreSQL, Auth, RLS and private Storage are the backend authority.
- Every visible record is scoped to an active tenant membership.
- The Pátio is read from `automotive_patio`; OS, box, payment, stage and media changes use the documented RPC functions.
- The frontend is a new implementation; no existing visual identity, runtime or design system needs preserving.
- The initial surface is an operational dashboard for `automotive_aesthetics`, not a consumer marketplace.

## Brand Commitments

The product name is Bora Marcá. Its language is Brazilian Portuguese, direct and operational; it should distinguish Agendamento, Entrada, OS, Pátio, Box, Pagamento and Entrega consistently.

## Evidence on Hand

The repository contains the Automotive operating specification, database contract and transactional SQL tests. No production customer records, logo assets, photographs or testimonials are available; interface examples must be labeled as demonstration data rather than claims.

## Product Principles

- Show the current operation before secondary analytics.
- Treat vehicle reception, service completion, payment and delivery as distinct moments.
- Keep tenant isolation and media privacy invisible to the operator but non-negotiable in the system.
- Favor fast, legible decisions at the pátio over decorative dashboard density.

## Accessibility & Inclusion

The web interface will use semantic controls, visible keyboard focus, sufficient contrast and responsive layouts. Specific accessibility validation with users remains an open product decision.
