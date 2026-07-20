// TypeScript resolution target only.
// Metro uses DateField.native.tsx on iOS/Android and DateField.web.tsx on
// web (same split as TechnicianMap.tsx).
export type { DateFieldProps } from './DateField.types';
export { DateField } from './DateField.native';
