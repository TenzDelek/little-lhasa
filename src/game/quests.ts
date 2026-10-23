// The four errands of the day. World modules only report events (G().emit) and ask for quest dialogue
// through talkTo(); all quest rules live here.
//
//   kora   — spin 12 different prayer wheels along the Tsuglagkhang's wheel row
//   momos  — Amala (Dharamkot Road) wants momos: buy a plate at Tashi's stall (Temple Road), bring it back
//   lamps  — light 5 butter lamps in the butter-lamp house by the temple gate
//   puppy  — Pema (Main Square) lost her puppy: find it on Bhagsu Road; it follows you home
import { G, onGameEvent, type DialogueLine, type Choice } from './store';
import { QUEST, NPC_IDS, ITEMS } from '../world/layout';
import { sfx } from '../audio/sfx';

export interface QuestDef {
  id: string;
  title: string;
  /** Tibetan-script title (optional). */
  bod?: string;
  /** Objective text for a stage (0 = not started). */
  objective: (stage: number, count: number) => string;
  /** Count target for collect quests. */
  target?: number;
  /** Shown in the log before the quest starts (auto-start quests skip stage 0). */
  autoStart?: boolean;
}

export const QUESTS: QuestDef[] = [
  {
    id: QUEST.kora, title: 'Turn the wheels', bod: 'མ་ཎི་འཁོར་ལོ།', autoStart: true, target: 12,
    objective: (_s, n) => `Spin prayer wheels on the Tsuglagkhang row (${Math.min(n, 12)}/12). Walk clockwise.`,
  },
  {
    id: QUEST.momos, title: 'Momos for Amala',
    objective: (s) => [
      'Visit Amala up on Dharamkot Road.',
      'Buy a plate of momos at Tashi’s stall on Temple Road (₹60).',
      'Bring the momos back to Amala.',
    ][Math.min(s, 2)],
  },
  {
    id: QUEST.lamps, title: 'Butter lamps', bod: 'མར་མེ།', autoStart: true, target: 5,
    objective: (_s, n) => `Light butter lamps in the lamp house by the temple gate (${Math.min(n, 5)}/5).`,
  },
  {
    id: QUEST.puppy, title: 'Pema’s puppy',
    objective: (s) => [
      'Someone on Main Square looks upset.',
      'Find Pema’s puppy somewhere along Bhagsu Road.',
      'Bring the puppy back to Pema on Main Square.',
    ][Math.min(s, 2)],
  },
];

const q = (id: string) => G().quests[id] ?? { id, stage: 0, done: false, count: 0, seen: [] };

function complete(id: string, reward: () => void) {
  const def = QUESTS.find((d) => d.id === id)!;
  G().patchQuest(id, { done: true });
  reward();
  G().toast(`Errand complete: ${def.title}`, 'quest');
  sfx('quest');
}

function advance(id: string, stage: number) {
  G().patchQuest(id, { stage });
  const def = QUESTS.find((d) => d.id === id)!;
  G().toast(def.objective(stage, q(id).count), 'quest');
  sfx('ui');
}

/** Wire quest rules to game events. Call once at startup; returns an unsubscribe. */
export function initQuests() {
  for (const d of QUESTS) if (d.autoStart && !G().quests[d.id]) G().patchQuest(d.id, { stage: 1 });

  return onGameEvent((e) => {
    switch (e.type) {
      case 'spinWheel': {
        G().addMerit(1);
        const k = q(QUEST.kora);
        if (e.group !== 'temple' || k.done || k.seen.includes(e.id)) return;
        const seen = [...k.seen, e.id];
        G().patchQuest(QUEST.kora, { seen, count: seen.length });
        if (seen.length >= 12) complete(QUEST.kora, () => { G().addMerit(108); G().toast('ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ། +108 merit', 'merit'); });
        return;
      }
      case 'lightLamp': {
        const l = q(QUEST.lamps);
        if (l.done || l.seen.includes(e.id)) return;
        const seen = [...l.seen, e.id];
        G().patchQuest(QUEST.lamps, { seen, count: seen.length });
        if (seen.length >= 5) complete(QUEST.lamps, () => G().addMerit(25));
        return;
      }
      case 'buy': {
        const m = q(QUEST.momos);
        if (e.item === ITEMS.momo && m.stage === 1 && !m.done) advance(QUEST.momos, 2);
        return;
      }
      case 'found': {
        const p = q(QUEST.puppy);
        if (e.id === ITEMS.puppy && !p.done) {
          G().setFlag('puppyFollowing', true);
          if (p.stage < 2) advance(QUEST.puppy, 2);
        }
        return;
      }
      default:
        return;
    }
  });
}

const L = (who: string, text: string, bod?: string): DialogueLine => ({ who, text, bod });

/**
 * Talk to an NPC. Quest NPCs get their quest lines; everyone else gets `fallback` (their own small talk).
 * NPC modules call this from their interactable: talkTo('amala', [...]).
 */
export function talkTo(npc: string, fallback: DialogueLine[], choices?: Choice[]) {
  G().emit({ type: 'talk', npc });
  sfx('talk');
  if (npc === NPC_IDS.amala) {
    const m = q(QUEST.momos);
    if (m.done) return G().say([L('Amala', 'Those momos were still warm! You are a good boy, Tenzin.', 'ཨ་མ་ལགས།'), L('Amala', 'Go and spin some prayer wheels for your grandfather, okay?')]);
    if (m.stage === 0) {
      G().say([
        L('Amala', 'Tashi delek, Tenzin-la! Come, come.', 'ཨ་མ་ལགས།'),
        L('Amala', 'My knees are too old for the hill today. Will you fetch me a plate of momos from Tashi’s stall on Temple Road?'),
        L('Amala', 'Here is a little money. Don’t eat them on the way!'),
      ], { onClose: () => { G().addRupees(60); G().toast('+₹60 from Amala', 'money'); advance(QUEST.momos, 1); } });
      return;
    }
    if (m.stage === 2 && G().takeItem(ITEMS.momo)) {
      G().say([
        L('Amala', 'Momos! Thuk-je-che, my dear.', 'ཐུགས་རྗེ་ཆེ།'),
        L('Amala', 'Take this for your pocket. And come for tea tomorrow.'),
      ], { onClose: () => complete(QUEST.momos, () => { G().addRupees(80); G().toast('+₹80 from Amala', 'money'); }) });
      return;
    }
    return G().say([L('Amala', m.stage === 1 ? 'Tashi’s stall is down Temple Road, on the left side as you walk to the temple.' : 'Where are my momos, Tenzin? Did you eat them?')]);
  }
  if (npc === NPC_IDS.pema) {
    const p = q(QUEST.puppy);
    if (p.done) return G().say([L('Pema', 'Khyi-gu is sleeping now. Thank you, Tenzin!', 'པདྨ།')]);
    if (p.stage === 0) {
      G().say([
        L('Pema', '…', 'པདྨ།'),
        L('Pema', 'My puppy ran away when the taxi honked. He went toward Bhagsu Road!'),
        L('Pema', 'He is small and brown with one white ear. Please find him?'),
      ], { onClose: () => advance(QUEST.puppy, 1) });
      return;
    }
    if (p.stage === 2 && G().flags.puppyFollowing) {
      G().say([L('Pema', 'Khyi-gu! You found him!', 'པདྨ།'), L('Pema', 'Here, I made this lucky knot for you.')], {
        onClose: () => complete(QUEST.puppy, () => { G().setFlag('puppyFollowing', false); G().setFlag('puppyHome', true); G().addItem('luckyKnot'); }),
      });
      return;
    }
    return G().say([L('Pema', 'Bhagsu Road is that way, past the taxis. Please hurry!', 'པདྨ།')]);
  }
  G().say(fallback, choices ? { choices } : undefined);
}

/** Buy something at a stall. Returns true if bought. Stalls call this from their interactable. */
export function buy(item: string, price: number, seller: string, line?: string): boolean {
  if (!G().spend(price)) { sfx('deny'); return false; }
  G().addItem(item);
  G().emit({ type: 'buy', item, price });
  sfx('coin');
  G().toast(`Bought ${item} for ₹${price}`, 'money');
  if (line) G().say([L(seller, line)]);
  return true;
}
