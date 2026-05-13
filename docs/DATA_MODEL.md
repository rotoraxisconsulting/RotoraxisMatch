# Data Model — RotoraxisMatch

## Core entities

- Technician
- Company
- MatchRequest
- TechnicianDocument
- Availability
- DemoSession

## Technician

Fields:
- id
- anonymousCode
- fullName
- email
- phone
- country
- city
- baseAirport
- latitude
- longitude
- licenseCategories
- aircraftTypes
- specialties
- availability
- verificationStatus
- profileCompleteness
- yearsExperience

## Company

Fields:
- id
- companyName
- country
- city
- website
- companyType
- verificationStatus
- contactEmail

## MatchRequest

Fields:
- id
- companyId
- technicianId
- status: sent | accepted | rejected
- identityRevealed
- createdAt

## TechnicianDocument

Fields:
- id
- technicianId
- type
- fileName
- status
- uploadedAt

## Privacy rule

Company must not see technician:
- fullName
- email
- phone

unless:

matchRequest.status === "accepted"
AND
identityRevealed === true

## Required privacy functions

- canCompanyViewTechnicianIdentity(companyId, technicianId, matchRequests)
- getSafeTechnicianView(technician, canRevealIdentity)

## Matching score

- +30 if licenseCategory matches
- +30 if aircraftType matches
- +15 if specialty matches
- +15 if available on selected date
- +10 if verified
- +10 if yearsExperience >= minYearsExperience
- +5 if baseAirport matches

Labels:
- 80-100: Excellent match
- 60-79: Strong match
- 40-59: Partial match
- <40: Low match