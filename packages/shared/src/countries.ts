/**
 * Where someone is from, asked during signup (§2.1).
 *
 * ISO 3166-1 alpha-2 codes, so the stored value is stable, two bytes wide and
 * the same one every other system in the world uses. Written as a tuple array
 * rather than the `{ key, label }` shape the other lists use — 200 object
 * literals is unreadable — and mapped into that shape below, so consumers see
 * the same interface as `GOALS` or `MAJORS`.
 *
 * Labels are the common English short names, not the ISO long forms: a chip
 * reading "Bolivia" beats one reading "Bolivia (Plurinational State of)".
 */
const RAW = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'],
  ['AO', 'Angola'], ['AG', 'Antigua & Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'],
  ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'],
  ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'],
  ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BT', 'Bhutan'],
  ['BO', 'Bolivia'], ['BA', 'Bosnia & Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'],
  ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
  ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['CV', 'Cape Verde'],
  ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'],
  ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'Congo (DRC)'],
  ['CR', 'Costa Rica'], ['CI', "Côte d'Ivoire"], ['HR', 'Croatia'], ['CU', 'Cuba'],
  ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['DJ', 'Djibouti'],
  ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt'],
  ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'],
  ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FJ', 'Fiji'], ['FI', 'Finland'],
  ['FR', 'France'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'],
  ['DE', 'Germany'], ['GH', 'Ghana'], ['GR', 'Greece'], ['GD', 'Grenada'],
  ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
  ['HT', 'Haiti'], ['HN', 'Honduras'], ['HK', 'Hong Kong'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'],
  ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'],
  ['JM', 'Jamaica'], ['JP', 'Japan'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'],
  ['KE', 'Kenya'], ['KI', 'Kiribati'], ['XK', 'Kosovo'], ['KW', 'Kuwait'],
  ['KG', 'Kyrgyzstan'], ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'],
  ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MO', 'Macao'], ['MG', 'Madagascar'],
  ['MW', 'Malawi'], ['MY', 'Malaysia'], ['MV', 'Maldives'], ['ML', 'Mali'],
  ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MR', 'Mauritania'], ['MU', 'Mauritius'],
  ['MX', 'Mexico'], ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'],
  ['MN', 'Mongolia'], ['ME', 'Montenegro'], ['MA', 'Morocco'], ['MZ', 'Mozambique'],
  ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NR', 'Nauru'], ['NP', 'Nepal'],
  ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'], ['NE', 'Niger'],
  ['NG', 'Nigeria'], ['KP', 'North Korea'], ['MK', 'North Macedonia'], ['NO', 'Norway'],
  ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'],
  ['PA', 'Panama'], ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'], ['PE', 'Peru'],
  ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'], ['PR', 'Puerto Rico'],
  ['QA', 'Qatar'], ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'],
  ['KN', 'St Kitts & Nevis'], ['LC', 'St Lucia'], ['VC', 'St Vincent & Grenadines'],
  ['WS', 'Samoa'], ['SM', 'San Marino'], ['ST', 'São Tomé & Príncipe'],
  ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'],
  ['SL', 'Sierra Leone'], ['SG', 'Singapore'], ['SK', 'Slovakia'], ['SI', 'Slovenia'],
  ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'],
  ['KR', 'South Korea'], ['SS', 'South Sudan'], ['ES', 'Spain'], ['LK', 'Sri Lanka'],
  ['SD', 'Sudan'], ['SR', 'Suriname'], ['SE', 'Sweden'], ['CH', 'Switzerland'],
  ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'],
  ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TO', 'Tonga'],
  ['TT', 'Trinidad & Tobago'], ['TN', 'Tunisia'], ['TR', 'Türkiye'], ['TM', 'Turkmenistan'],
  ['TV', 'Tuvalu'], ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'],
  ['GB', 'United Kingdom'], ['US', 'United States'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'],
  ['VU', 'Vanuatu'], ['VA', 'Vatican City'], ['VE', 'Venezuela'], ['VN', 'Vietnam'],
  ['YE', 'Yemen'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
] as const satisfies readonly (readonly [string, string])[];

export type CountryKey = (typeof RAW)[number][0];

export const COUNTRIES: readonly { key: CountryKey; label: string }[] = RAW.map(
  ([key, label]) => ({ key, label }),
);

export const COUNTRY_KEYS = RAW.map(([key]) => key) as [CountryKey, ...CountryKey[]];

export function countryLabel(key: CountryKey): string {
  return COUNTRIES.find((c) => c.key === key)?.label ?? key;
}
