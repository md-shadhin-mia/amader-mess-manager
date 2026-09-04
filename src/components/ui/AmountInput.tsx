import { normalizeDigits } from '../../lib/numbers';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Quick-fill buttons shown under the field. */
  chips?: number[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  required?: boolean;
  ariaLabel?: string;
}

/**
 * Money field that accepts Bengali or Arabic-Indic digits and normalises them
 * to ASCII as the user types, with optional one-tap preset chips.
 */
export default function AmountInput({ value, onChange, chips, placeholder, className = '', autoFocus, required, ariaLabel }: AmountInputProps) {
  return (
    <div>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          required={required}
          aria-label={ariaLabel}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(normalizeDigits(e.target.value).replace(/[^0-9.]/g, ''))}
          className={`w-full px-4 py-3 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${className}`}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">৳</span>
      </div>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChange(String(chip))}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                value === String(chip) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
