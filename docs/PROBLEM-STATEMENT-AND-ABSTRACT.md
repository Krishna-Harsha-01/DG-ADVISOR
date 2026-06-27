# Problem Statement & Abstract

## Problem Statement
HK Shipping Private Limited is a road freight logistics company in Hyderabad moving
full-truck-load and part-load cargo across South India. When a shipment includes
chemical, flammable, or otherwise hazardous goods, staff must determine the correct
dangerous-goods classification, UN number, packaging, labelling, documentation, and
handling requirements. Today this depends on manual knowledge, phone calls, WhatsApp
messages, and spreadsheets — which is slow, inconsistent, and error-prone. Mistakes in
dangerous-goods compliance can lead to penalties, vehicle detention, and safety risk, and
there is no central record or management visibility of these checks.

## Abstract
The AI Dangerous Goods Handling Compliance Advisor is a full-stack web application that
lets logistics staff enter a shipment's goods and details and instantly receive
AI-generated compliance guidance: hazard classification, UN number, packaging, labelling,
documentation, handling steps, warnings, and a road-transport feasibility check. The
backend (Node.js + Express) builds a structured prompt from the inputs, calls an AI
provider, parses the response, and stores it in MySQL. Staff sign in with shift-based
access codes; an administrator can review usage and quality analytics, see who logged in
and when, and manage form presets. The tool reduces manual effort and inconsistency while
keeping a central, searchable record — with the clear caveat that it is advisory and must
be verified against the Safety Data Sheet and official regulations.
