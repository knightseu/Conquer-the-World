# 0001. Native Swift/SwiftUI iOS client

Status: accepted

## Context
The core feature is reliable background GPS recording on iPhone. Cross-platform frameworks (Flutter, React Native) still require native modules for background location, so they save little for this feature. v1 targets iOS only; Android comes in v2.

## Decision
Build the v1 client natively in Swift/SwiftUI. Keep clients thin: they collect GPS, render maps and call the API. All domain rules live on the server (see ADR 0002).

## Consequences
- Best control over background location and battery.
- Android later means writing a second client against the same API; no rules to re-implement.
