// What people say. Each archetype has a few short conversations; every NPC gets one picked by seed and moves
// on to the next one each time Tenzin talks to them again. Tibetan phrases come with gentle glosses.
//   Tashi delek — hello / good luck · Thuk-je-che — thank you · Kale phe — go slowly (to someone leaving)
//   Khye-rang ku-su de-bo yin-pe? — how are you? · La so — yes / okay (polite) · Ya — okay
//   Kha-lag zhe-song? — have you eaten? · Mo-la / Po-la — grandma / grandpa · bu — boy, son
//   Gong-da — sorry / excuse me · Kale kale — slowly, slowly · Khyi-gu — puppy

export type Convo = readonly string[];

export const TALK: Record<string, readonly Convo[]> = {
  monk: [
    ['Tashi delek, Tenzin-la.', 'Remember: on the kora we walk clockwise, with the temple on our right.', 'The prayer wheels turn clockwise too. Om mani padme hum.'],
    ['Khye-rang ku-su de-bo yin-pe? (How are you?)', 'We have debate this afternoon. Lots of clapping, very little sleeping.'],
    ['I read the same page of my text all morning.', 'Then a monkey took the page. Now I must learn it from the monkey.'],
    ['Do not hurry so much, little brother.', 'The temple has been here a long time. It will wait for you. Kale kale — slowly, slowly.'],
  ],
  nun: [
    ['Tashi delek! We walked down from the nunnery this morning.', 'The momos on Temple Road are good, but do not tell my teacher I said so.'],
    ['Have you lit a butter lamp today?', 'One small flame for everyone you love. That is a lot of butter, ha!'],
    ['La so, la so. (Yes, yes.)', 'Walk the Lingkhor with your grandmother sometime. She will tell you all the old stories.'],
  ],
  debater: [
    ['Dhi! — that is how every debate begins.', 'The standing monk asks. The sitting monk must answer. The clap means: answer that!'],
    ['Shh, Tenzin, he almost has me!', '…No wait, I almost have him. Dhi!'],
    ['We debate to sharpen the mind, not to win.', '…But I would also like to win.'],
  ],
  elderF: [
    ['Om mani padme hum… Tashi delek, bu.', 'Walk with me a little. The kora is shorter with company.'],
    ['Kha-lag zhe-song? (Have you eaten?)', 'You are too thin. Go and tell your Amala I said so.'],
    ['I have walked this kora every morning for forty years.', 'My knees are old, but my prayer wheel is older. Om mani padme hum.'],
  ],
  elderM: [
    ['Tashi delek, bu. You are Amala’s grandson, no?', 'Your grandfather and I came over the mountains together. A long walk. Longer than this kora.'],
    ['La so… slowly, slowly. The wheel turns, the feet turn.', 'One more round and then I will have my tea.'],
    ['Thuk-je-che for slowing down for an old man.', 'Young legs always run. Old legs always arrive.'],
  ],
  womanShop: [
    ['Tashi delek, Tenzin! Kha-lag zhe-song? (Have you eaten?)', 'Tomatoes are eighty rupees today. Eighty! In my time they were free from the garden.'],
    ['I am going to the vegetable market before the good chillies are gone.', 'Tell Amala I will bring her some dried cheese on Sunday.'],
    ['Khye-rang ku-su de-bo yin-pe? (How are you?)', 'Good, good. Go home before dark, okay?'],
  ],
  youth: [
    ['Tashi delek, bro!', 'Have you tried the new café on Jogiwara Road? Best butter tea in town… just kidding, I drink coffee.'],
    ['Ya, ya, I am late for English class.', 'If you see my mother, you did not see me. Kale phe!'],
    ['Nice chuba, Tenzin. Very traditional. Very cool.', 'Losar is coming, I need to find mine. I think my brother is wearing it.'],
  ],
  kid: [
    ['Tenzin! Are you coming to play football after school?', 'Last time the ball went over the wall and a monkey kept it.'],
    ['We have a Tibetan spelling test tomorrow.', 'Ka, kha, ga, nga… I always forget what comes after nga.'],
    ['My teacher says if we walk the kora we get merit.', 'I asked if merit can buy laphing. She said no.'],
  ],
  shopkeeper: [
    ['Come, come! Looking is free!', 'Singing bowls, malas, prayer flags — for you, local price.'],
    ['Tashi delek, little brother. Business is slow today.', 'Too many tourists only want photos of the monkeys.'],
    ['These prayer flags? Blue, white, red, green, yellow — always in that order.', 'Sky, cloud, fire, water, earth. Hang them high and the wind does the praying.'],
  ],
  kashmiri: [
    ['Salaam, chhotu! Pashmina, very warm, very best.', 'Okay, okay, too big for you. Come back when you are taller.'],
    ['Twenty years I have a shop in McLeod Ganj.', 'I speak a little Tibetan also. Tashi delek! Thuk-je-che! See?'],
  ],
  chai: [
    ['Chai, chhotu? Garam garam! Ten rupees only.', 'Okay, okay, no money? Next time. Tell your friends my chai is the best.'],
    ['Arre, so cold this morning, even the monkeys wanted chai.', 'Cutting chai, half glass. Just enough to keep you warm.'],
  ],
  taxi: [
    ['Taxi? Bhagsu? Dharamkot? Triund?', 'Arre chhotu, you cannot afford a taxi. Walk — good for your legs!'],
    ['Kangra airport, nine hundred. Pathankot, two thousand.', 'For you? Same price. Haha, I am only joking. Go home!'],
    ['Twenty years I drive these roads. Every corner, I know.', 'Except the corner where the cows sleep. That corner belongs to the cows.'],
  ],
  touristIn: [
    ['Excuse me, chhotu, where is the Bhagsu waterfall?', 'That way? Walking? Arre, so far… okay, okay, we will walk.'],
    ['Arre wah, so cute! Chhotu, one selfie please?', '…Thank you! My mummy will love this.'],
    ['We came from Delhi for the cold weather.', 'Now it is too cold. Where can we get a sweater?'],
  ],
  touristW: [
    ['Hi! Is this the way to the Bhagsu waterfall?', 'Thanks, little dude! Tashi delek! Did I say that right?'],
    ['I came here for one week.', 'That was three months ago. I cannot leave. The momos will not let me.'],
    ['Do you know a good place for a meditation course?', 'I have done four already. I am very, very relaxed. Can you tell?'],
  ],
  teaAuntie: [
    ['Chai, beta? Masala chai, ginger chai, lemon-honey for the sore throat.', 'Twenty rupees. For Tibetan boys with nice manners, also twenty rupees.'],
    ['All day the tourists walk to Bhagsu waterfall and all day they come back tired.', 'Then they drink my chai. Good business, that waterfall.'],
  ],
  tashi: [
    ['Tashi delek! Momo, fresh momo! Steamed or fried?', 'Buy at the counter, little brother. Sixty rupees a plate.'],
    ['My momos are the best in McLeod Ganj.', 'Ask anyone. Ask my mother. She taught me.'],
    ['Veg momo, chicken momo, cheese momo…', 'Always with the red chilli sauce. Careful, it bites!'],
  ],
  dolma: [
    ['Laphing! Cold and spicy, only forty rupees.', 'Not too spicy for you? Your face is going red already, ha!'],
    ['My laphing is made fresh every morning.', 'In Lhasa they ate it in summer. Here we eat it all year. Even in the rain.'],
  ],
  balep: [
    ['Fresh balep, still warm from the pan!', 'Balep korkun — round and flat. Twenty rupees, with butter tea it is perfect.'],
    ['Tashi delek, Tenzin. Tell Amala I saved her a loaf.', 'She always says my bread is too hard. Then she eats two.'],
  ],
  pema: [['…'], ['Tashi delek, Tenzin!']],
  amala: [['Tashi delek, Tenzin-la.']],
};

/** Lines that depend on Tenzin's errands (checked before the small talk). */
export const HINTS = {
  /** Talking to Tashi while fetching Amala's momos. */
  tashiMomos: ['Amala sent you? Tell her Tashi says Tashi delek!', 'Buy a plate at the counter — I will put extra chilli sauce. She likes it hot.'],
  /** Taxi drivers while Pema's puppy is lost. */
  taxiPuppy: ['A small brown puppy with one white ear? Arre…', 'Maybe I honked a little. It ran off toward Bhagsu Road. Sorry, chhotu!'],
  /** The tea-shop auntie on Bhagsu Road while the puppy is lost. */
  teaPuppy: ['A puppy? Something has been sniffing round behind my shop all morning.', 'Go and look, beta. Gently — little ones get scared.'],
  /** Anyone Tibetan after the puppy is home. */
  puppyHome: ['I heard you found Pema’s puppy! Thuk-je-che, Tenzin.'],
};

/** Short phrases popped in bubbles when Tenzin walks close. */
export const GREET: Record<string, readonly string[]> = {
  monk: ['TASHI DELEK!', 'ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ'],
  nun: ['TASHI DELEK!', 'བཀྲ་ཤིས་བདེ་ལེགས།'],
  debater: ['DHI!'],
  elderF: ['ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ', 'TASHI DELEK, BU!'],
  elderM: ['ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ', 'KALE KALE...'],
  womanShop: ['TASHI DELEK!', 'KHA-LAG ZHE-SONG?'],
  youth: ['TASHI DELEK!', 'YO TENZIN!'],
  kid: ['TENZIN!', 'FOOTBALL LATER?'],
  shopkeeper: ['COME, COME!', 'LOOKING IS FREE!'],
  kashmiri: ['PASHMINA, CHHOTU?'],
  chai: ['CHAI! GARAM CHAI!'],
  taxi: ['TAXI? BHAGSU?'],
  touristIn: ['HELLO CHHOTU!', 'ONE SELFIE?'],
  touristW: ['HI THERE!', 'TASHI DELEK?'],
  tashi: ['MOMO, MOMO!', 'FRESH MOMO!'],
  teaAuntie: ['CHAI, BETA?'],
  dolma: ['LAPHING!', 'COLD AND SPICY!'],
  balep: ['FRESH BALEP!'],
  amala: ['TENZIN-LA!'],
  pema: [],
};

export const BYE = 'KALE PHE!';
/** Said when Tenzin stands in someone's way. Tibetans say "gong-da" (sorry / excuse me). */
export const EXCUSE: Record<string, string> = {
  touristIn: 'EXCUSE ME, CHHOTU!',
  taxi: 'SIDE, CHHOTU!',
  touristW: 'EXCUSE ME!',
  default: 'GONG-DA!',
};
export const PEMA_HAPPY = 'KHYI-GU!';

/** Every phrase that can appear in a bubble (pre-drawn into the atlas). */
export const ALL_PHRASES: string[] = [
  ...new Set([...Object.values(GREET).flat(), BYE, ...Object.values(EXCUSE), PEMA_HAPPY]),
];
