// V2 types — canonical source of truth
export * from './enums';       // AppRole, UserStatus, VerificationStatus, DocumentStatus, OfferRequestStatus, OfferStatus, CompanyMemberRole, ExperienceUnit, SenderRole
export * from './catalog';     // TechnicianTypeCode, LicenseCode, ContractTypeCode, CompanyTypeCode, catalog interfaces
export * from './profile';     // Profile
export * from './technician';  // TechnicianProfile, TechnicianWithRelations, TechnicianLicense, TechnicianHabilitation, TechnicianAircraftExperience, SocialLinks, Availability + V1 compat: Technician, SafeTechnicianView, AvailabilityStatus, ContractType
export * from './privacy';     // SafeTechnicianPreview, UnlockedTechnicianView, TechnicianView, isUnlocked, TechnicianPublicPreviewDTO, TechnicianUnlockedDTO
export * from './company';     // CompanyProfile, CompanyMember + V1 compat: Company, CompanyType
export * from './offer';       // Offer, OfferWithRequirements
export * from './offerRequest'; // OfferRequest, OfferApplication, OfferInboxRecord, isDirectOffer, isApplication
export * from './chat';        // ChatRoom, ChatMessage
export * from './document';    // Document, TechnicianDocument, DocumentType + V1 compat: TechnicianDocument
export * from './filters';     // TechnicianSearchFilters, OfferSearchFilters + V1 compat: TechnicianFilters, MapFilters
export * from './matching';    // MatchScore, MatchLabel

// V1 unchanged files
export * from './session';     // UserRole, DemoSession
export * from './matchRequest'; // MatchRequest, MatchRequestStatus
