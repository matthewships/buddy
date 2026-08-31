/**
 * Favourite topics — what someone likes to talk and learn about (§2.1).
 *
 * Distinct from `majors`: a law student whose favourite topic is machine
 * learning is exactly the kind of match the directory should surface, and
 * collapsing the two would hide them. Stored in `user_tags` with
 * `kind = 'topic'`, so a user can hold several and the directory can filter on
 * any one of them.
 */
export const TOPICS = [
  { key: 'ai', label: 'AI & machine learning' },
  { key: 'programming', label: 'Programming' },
  { key: 'startups', label: 'Startups' },
  { key: 'science', label: 'Science' },
  { key: 'space', label: 'Space' },
  { key: 'climate', label: 'Climate' },
  { key: 'health', label: 'Health & medicine' },
  { key: 'psychology', label: 'Psychology' },
  { key: 'philosophy', label: 'Philosophy' },
  { key: 'history', label: 'History' },
  { key: 'politics', label: 'Politics' },
  { key: 'economics', label: 'Economics' },
  { key: 'finance', label: 'Personal finance' },
  { key: 'design', label: 'Design' },
  { key: 'writing', label: 'Writing' },
  { key: 'languages', label: 'Languages' },
  { key: 'literature', label: 'Books & literature' },
  { key: 'film', label: 'Film & TV' },
  { key: 'music', label: 'Music' },
  { key: 'art', label: 'Art' },
  { key: 'sports', label: 'Sports' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'food', label: 'Food & cooking' },
  { key: 'travel', label: 'Travel' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'study_skills', label: 'Study skills' },
  { key: 'careers', label: 'Careers & internships' },
  { key: 'productivity', label: 'Productivity' },
] as const satisfies readonly { key: string; label: string }[];

export type TopicKey = (typeof TOPICS)[number]['key'];

export const TOPIC_KEYS = TOPICS.map((t) => t.key) as [TopicKey, ...TopicKey[]];

export function topicLabel(key: TopicKey): string {
  return TOPICS.find((t) => t.key === key)!.label;
}
