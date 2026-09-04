/**
 * Institution names are free text (there is no institution dataset in this
 * repo, and any curated list would be both incomplete and out of date), so
 * "same institution" cannot be a string equality test: `MIT`, `M.I.T.` and
 * `mit ` are the same school typed three ways.
 *
 * `normaliseInstitution` defines what "the same" means, and it has exactly one
 * definition on purpose. Two things depend on it — the directory's "same
 * institution as me" filter and the `sameInstitution` term in the match score —
 * and if they normalised differently the sort would rank someone the filter
 * then hid.
 *
 * The result is stored in `users.institution_normalised` beside the raw text,
 * so the comparison is an indexed equality rather than a scan with a function
 * applied to every row. The raw text is what gets displayed; this is only ever
 * a matching key.
 *
 * Deliberately conservative: it folds case, accents, punctuation, runs of
 * whitespace, a leading "the", and dotted acronyms. It does not expand
 * abbreviations or match "Univ." to "University" — that is fuzzy matching, and
 * a wrong guess silently merges two different schools, which is worse than
 * missing a match.
 */
export function normaliseInstitution(value: string): string {
  const tokens = value
    .normalize('NFKD')
    // Strip combining marks, so "École" and "Ecole" agree.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Punctuation becomes a separator rather than nothing, so "St.Andrews"
    // splits into two tokens instead of fusing into one.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  // A run of single-character tokens is a spelled-out acronym: "M.I.T." arrives
  // here as ["m","i","t"] and has to rejoin as "mit" to equal someone else's
  // "MIT". Only runs of two or more, so the "a" in "Texas A M" is left alone.
  const joined: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    let end = i;
    while (end < tokens.length && tokens[end]!.length === 1) end += 1;
    if (end - i >= 2) {
      joined.push(tokens.slice(i, end).join(''));
      i = end;
    } else {
      joined.push(tokens[i]!);
      i += 1;
    }
  }

  // Leading article last, once the tokens are clean — running it against the
  // raw string misses "  The University of Toronto".
  if (joined[0] === 'the') joined.shift();

  return joined.join(' ');
}
