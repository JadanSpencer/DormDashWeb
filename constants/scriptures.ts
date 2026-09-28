// constants/scriptures.ts
// Bible verses shown on the student home screen (components/Scripture.tsx).
// King James Version: public domain, and the translation most familiar in
// Jamaica. Short, encouraging verses for students; a couple about bread and
// tasting, for a food app. To add one, append { text, ref }: keep it to a
// few lines so the card stays small.

export type Scripture = { text: string; ref: string };

export const SCRIPTURE_VERSION = 'KJV';

/** A new verse every this many minutes (the same verse for everyone at once). */
export const SCRIPTURE_ROTATE_MS = 10 * 60 * 1000;

export const SCRIPTURES: Scripture[] = [
  { text: 'I can do all things through Christ which strengtheneth me.', ref: 'Philippians 4:13' },
  { text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.', ref: 'Proverbs 3:5–6' },
  { text: 'O taste and see that the LORD is good: blessed is the man that trusteth in him.', ref: 'Psalm 34:8' },
  { text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', ref: 'Jeremiah 29:11' },
  { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', ref: 'Isaiah 40:31' },
  { text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', ref: 'Joshua 1:9' },
  { text: 'I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.', ref: 'John 6:35' },
  { text: 'God is our refuge and strength, a very present help in trouble.', ref: 'Psalm 46:1' },
  { text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.', ref: 'Matthew 11:28' },
  { text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.', ref: 'Philippians 4:6' },
  { text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', ref: 'Romans 8:28' },
  { text: 'Casting all your care upon him; for he careth for you.', ref: '1 Peter 5:7' },
  { text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'It is of the LORD’s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.', ref: 'Lamentations 3:22–23' },
  { text: 'Commit thy works unto the LORD, and thy thoughts shall be established.', ref: 'Proverbs 16:3' },
  { text: 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.', ref: 'James 1:5' },
  { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' },
  { text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.', ref: 'Isaiah 41:10' },
  { text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.', ref: '2 Timothy 1:7' },
  { text: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.', ref: 'Colossians 3:23' },
  { text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.', ref: 'Matthew 6:33' },
  { text: 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.', ref: 'Psalm 37:4' },
  { text: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.', ref: 'Galatians 6:9' },
  { text: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.', ref: 'John 14:27' },
  { text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.', ref: 'Psalm 121:1–2' },
  { text: 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.', ref: 'Matthew 5:16' },
  { text: 'The name of the LORD is a strong tower: the righteous runneth into it, and is safe.', ref: 'Proverbs 18:10' },
  { text: 'In every thing give thanks: for this is the will of God in Christ Jesus concerning you.', ref: '1 Thessalonians 5:18' },
  { text: 'Cast thy burden upon the LORD, and he shall sustain thee: he shall never suffer the righteous to be moved.', ref: 'Psalm 55:22' },
  { text: 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?', ref: 'Micah 6:8' },
  { text: 'I will never leave thee, nor forsake thee.', ref: 'Hebrews 13:5' },
];

/** The verse for this moment: everyone sees the same one, and it changes every SCRIPTURE_ROTATE_MS. */
export function scriptureAt(nowMs: number): { verse: Scripture; nextAt: number } {
  const slot = Math.floor(nowMs / SCRIPTURE_ROTATE_MS);
  return {
    verse: SCRIPTURES[((slot % SCRIPTURES.length) + SCRIPTURES.length) % SCRIPTURES.length],
    nextAt: (slot + 1) * SCRIPTURE_ROTATE_MS,
  };
}
