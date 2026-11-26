// Homepage wording in one place. Edit freely — nothing else depends on it.
// Leave a value as '' to hide that piece of the page.

export const SITE = {
  heroTitle: 'The next generation of Gwinnett conservatives',
  heroText:
    'Young professionals and students, ages 18 to 40, building friendships, backing good candidates, and getting involved in the county we call home.',

  // Quick facts band.
  facts: [
    { value: 'Nearly 1M', label: 'Gwinnett residents' },
    { value: '2nd', label: 'Most populous county in Georgia' },
    { value: '18–40', label: 'Age range for members' },
  ],

  about: [
    "Gwinnett is one of the largest and most diverse counties in Georgia, and the choices made here over the next few years will shape it for a generation. We think young conservatives should be in the room when those choices are made.",
    'The Gwinnett County Young Republicans bring together people ages 18 to 40 who want to do more than vote. We meet regularly, get to know each other, hear from candidates and leaders, and roll up our sleeves when campaigns need help.',
    "Whether you've been involved for years or you're just curious, there's a place for you here.",
  ],

  values: [
    { title: 'Conservative principles', text: 'Limited government, free enterprise, personal responsibility and strong families.' },
    { title: 'Community', text: 'A network of friends and young professionals across Gwinnett.' },
    { title: 'Getting involved', text: 'Volunteering, door-knocking and supporting good candidates at every level.' },
    { title: 'Leadership', text: 'Helping members grow into precinct, party and public leadership roles.' },
  ],

  // Regular meeting. Leave schedule '' to hide this block.
  meeting: {
    schedule: '',        // e.g. 'Every 2nd Thursday at 7:00 PM'
    place: '',           // e.g. 'Taproom name'
    address: '',         // e.g. '123 Main St, Lawrenceville, GA 30046'
    note: '',            // e.g. 'Casual — come as you are.'
  },

  contactEmail: '',      // e.g. 'info@gwinnettyr.com'
  social: {
    instagram: '',       // full URLs
    facebook: '',
    x: '',
  },

  // Affiliation links (only shown if set).
  affiliations: [] as { name: string; url: string; text: string }[],
}
