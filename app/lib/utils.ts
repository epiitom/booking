// Small Tailwind-friendly `cn` helper.
// This project references `./lib/utils` from `app/index.tsx`.

type ClassPrimitive = string | number | null | undefined | false;
type ClassValue = ClassPrimitive | ClassValue[] | Record<string, boolean>;

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  const visit = (value: ClassValue): void => {
    if (!value) return; // handles null/undefined/false

    if (typeof value === 'string') {
      if (value.trim()) classes.push(value);
      return;
    }

    if (typeof value === 'number') {
      classes.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    // object form: { "class-name": true/false }
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) classes.push(key);
    }
  };

  for (const input of inputs) visit(input);
  return classes.join(' ');
}

