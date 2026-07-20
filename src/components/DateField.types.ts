export interface DateFieldPalette {
  text: string;
  muted: string;
  border: string;
  surface: string;
  accent: string;
}

export const DEFAULT_DATE_FIELD_PALETTE: DateFieldPalette = {
  text: '#1A2332',
  muted: '#94A3B8',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  accent: '#2563EB',
};

export interface DateFieldProps {
  // ISO 'YYYY-MM-DD', or undefined for an unset/cleared date. There is no
  // third "invalid" state — the platform picker (native OS dialog on
  // iOS/Android, <input type="date"> on web) physically cannot produce
  // anything else.
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  palette?: Partial<DateFieldPalette>;
  disabled?: boolean;
}
