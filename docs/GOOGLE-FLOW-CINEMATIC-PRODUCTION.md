# FixTradeZone — Google Flow Cinematic Video Production & New-Chat Handoff

**Status:** Founder-requested marketing production workflow documented 2026-10-08.
**Scope:** Creative direction, Google Flow prompt preparation, Flow-native voice, video review, and campaign continuity. Documentation only; no application code, production configuration, or financial logic changes.
**Other references:** `docs/MARKETING-TERMINOLOGY.md`, `docs/DECISIONS.md` (especially ADR-008, ADR-025, ADR-027), `docs/MLM-BUSINESS-RULES.md`, and the current effective product/catalogue rules.

## 1. Starting any new chat/session — read first

1. Read this document and `docs/MARKETING-TERMINOLOGY.md` before drafting or revising FixTradeZone marketing video prompts.
2. The Founder has **already set the global Google Flow Agent Instructions** and uploaded the **original official logo media reference** `fixtradezone_final_logo.png` in Flow. Do not ask the Founder to configure those again without a reason.
3. **Current production stage: Video 1 — Intro / Brand Launch**, beginning with **one 8-second intro/logo-reveal scene**. Wait for Founder review before advancing to the next scene or later videos.
4. **Do not deliver another scene prompt until requested.** No video prompts or video generation until the repo rules are recorded and the Founder asks to proceed.
5. Each requested scene prompt must be **fully self-contained and ready to copy/paste**, with applicable project facts already included, not a separate fact block or placeholders for the Founder to fill.
6. Do not modify modules/APIs or PR to `main`. The repo's local-first/Postman-before-PR policy applies to feature development. Documentation-only creative handoffs do not claim local API testing; no PR or merge without the Founder's explicit next-step approval.

## 2. Marketing positioning requested by Founder — important claim gate

- Exact Founder-requested **future marketing positioning string**: **`Platform: Algorithm & AI-Based Trading Platform`**.
- Record that exact requested wording in creative briefs for continuity. **This is not a verified factual certification** that a live AI trading engine exists.
- As of this checkpoint, locked ADR-027 explicitly states there is **no AI Agents/trading-engine milestone in v1**, and no broker/exchange trading execution. An unqualified claim that an `AI-Based Trading Platform` performs actual AI-driven trading must **not be published** until its specific meaning, live AI functionality, approval, and any relevant marketing/legal disclosure requirements are verified. This request does not amend ADR-027 or authorize misleading product claims.
- Currently verifiable fallback classification: **`Algorithm-Based Trading Platform`**. Creative treatment may be **AI-inspired**, **futuristic**, **alien-tech**, and **intelligent-looking**, without asserting an unimplemented autonomous AI trading feature.
- If actual implemented AI features and accurate scope are later established, seek explicit Founder approval for the precise marketing claim and document the verified basis before presenting the new public-facing phrase as a fact.
- Do not assert real exchange/broker execution. **Algorithm-Generated Trade Activity** is produced first; separate authoritative Internal Trading settlement and applicable rules govern eligible financial earnings. Daily generated activity alone is not a wallet payout.

## 3. Exact logo, site, and brand

- Brand **FixTradeZone**. Live site: **`https://fixtradezone.com`**. Public final CTA: **`LIVE NOW`** and **`fixtradezone.com`**.
- Original approved logo source: **`fixtradezone_final_logo.png`**. This exact filename was uploaded by the Founder as a Google Flow reference. It is the **only official logo**; preserve its design, proportions, geometry, colors, wordmark and overall appearance.
- Never regenerate, reimagine, substitute, stretch, alter, or redraw it. **`docs/brand/fixtradezone-logo.svg` on this branch is an incorrect, unapproved redraw; DO NOT use it as the source for promotional assets.**
- Generative image/video tools may deform original logos even with image reference. If Flow cannot preserve the exact mark, reject the logo rendering and use a clean hero logo placement area; any later non-Flow correction/compositing requires specific Founder consent because the current preference is to generate the complete video, including audio, in Google Flow.
- Do not assume the original PNG binary is committed to this repo simply because its name is documented. In a new session, verify media availability rather than inventing asset paths.
- Currency and blockchain network context: **USDT (BEP-20)**, **BNB Smart Chain**. No INR/₹, no TRC20 in current approved promo creatives unless a specifically verified current feature calls for it. Avoid fabricated balances.
- Never advertise `coming soon` or `sample` on completed public marketing creatives.

## 4. Hollywood + alien-tech cinematic creative system

- Feel: enormous-budget Hollywood science-fiction teaser meets next-generation premium fintech; breathtaking but coherent and credible technology visualization.
- First **1–3 seconds** must have an immediate visual/auditory hook to discourage scrolling away; no lengthy bland opening.
- Color: midnight navy / near-black, electric cyan and blue, controlled purple glints. High visual depth, detailed particles, plasma-energy rings, holographic hexagons, advanced digital grids, volumetric light, physically convincing premium reflections, strong camera pushes, subtle parallax and cinematic reveals.
- Logo presentation is a **hero event** with precise central framing, memorable highlight, strong sense of scale and time to appreciate the image.
- Avoid generic stock-style financial imagery, messy hologram text, deformed fonts, noisy overstimulation, random currency, fake broker charts/real-exchange scenes, exaggerated rockets, unreadable mobile UI, or fabricated financial success.
- Vertical **9:16**, intended export **1080 × 1920**. Prefer Flow/Veo **8-second** scenes, one generation at a time while optimizing credits; confirm options/pricing/limits in the actual UI, do not promise constant capabilities. Export/framerate can be standardized after approval if Flow output differs.
- Build scenes to stitch together **without visible break**: persistent palette, coherent stage/world, matching lighting, consistent camera direction, compatible movement/energy motif, exact first/last frame continuity, no fade-to-black between clips unless narratively deliberate. Use reference last-frame/extend features if present; verify actual Flow UI functionality.

## 5. Voice is generated INSIDE Google Flow — Founder correction (supersedes prior plan)

**Founder-locked preference, 2026-10-08:** **Generate both voice narration and visuals in Google Flow itself.** Do **not** plan a separate Gemini AI Studio TTS WAV and later audio merge as the default, since Founder reports that separate audio merging caused problems.

- Each relevant Flow scene prompt must explicitly request **native/generated spoken narration**, not `No narration`. Clearly specify the exact short voiceover line(s) and their timing within that scene. One 8-second clip should have only the amount of dialogue a human can deliver comfortably with natural pauses; no speech cut at scene boundary.
- Preferred narrator across all related clips: **same consistent-sounding deep, warm, confident, natural human male** voice, premium Hollywood brand trailer, clear international English, rich articulation, natural connection, moderate pace, not robotic, shouting, or excessively theatrical.
- The voice must be **foreground, intelligible and prominent** at phone speaker volume. Keep score/sound effects subordinate; no music/impacts over words. Smooth punctuation, no strange breaks or unintelligible speech.
- Use the **same explicit voice-character description** in EVERY scene prompt, including continuation clips. Because separately generated Flow clips may still vary in voice/accent/timbre and do not guarantee identity, manually listen and review; regenerate/rework mismatched clips rather than pretending continuity is exact.
- Prompt for a **continuous narrative across scene boundaries** without clipped syllables or a new unrelated narrator. Plan scene-specific exact VO lines that can be completed inside eight seconds, and pair on-screen shots with matching words.
- Voice QA is mandatory: listen to first, middle and end of each clip; confirm **spoken voice actually present**, intelligible, not drowned by music, synchronized to visuals, and no missing final words; inspect stitched cut for volume/timbre jumps. Audio stream existence alone is inadequate.
- The Founder **approved prior Facebook Launch Reel V4** as a strong quality reference for clear natural male narration, music balance, and voice/graphics timing. That earlier version used Gemini **Rami** and a corrected external merge. **Use V4 only as the acceptance benchmark**, not as instructions to recreate the external voice workflow. Flow-native generation is now the preferred process; match Rami's *quality and delivery* as closely as possible, without claiming that Flow has a selectable identical Rami voice.
- If Flow cannot reliably produce coherent, clear, continuous voice, report the limitation and ask Founder before proposing external voice editing as a fallback.

## 6. Product messaging, claims, and factual restrictions

Core eligible areas to cover **across separate films/scenes**, never overload one 8-second clip:
- Packages/plans and **verified applicable daily rate ranges**;
- algorithm-generated daily trade activity, actual authoritative earnings settlement, and eligible wallet balances;
- referral income and level-wise referral structures, subject to actual published plan and qualification requirements;
- team business, team rewards, milestone awards and bonus programs where currently implemented and eligible;
- USDT (BEP-20) wallet, payout requests, and reinvestment options subject to policy;
- realistic How FixTradeZone Works: registration/onboarding, verified deposit and active package steps, generated daily activity, settlement, wallet, eligible payout/reinvestment, referrals/rewards where available.

Never invent, extrapolate, or promise fixed daily profits, guaranteed income, risk-free outcomes, fabricated payout proofs, false testimonials, fake chart positions or balances. The source repository includes historical reference plan/rate tables and QA commission rates. Treat these as versioned/reference facts, **not automatically proof of live current policy**. For prompts containing exact plan names, prices, rates, levels, awards, or payout terms, check the effective published public product terms as near to generation as possible, preserve conditions, and avoid ambiguous claims of actual user profits.

Marketing category should not use **Internal** as a prefix in public headlines. Technical architecture discussion can describe internal settlement if necessary. Prefer **Algorithm-Generated Trade Activity**, **Daily Earnings** (where eligible and actually settled), **Wallet**, **Payout**, **Reinvestment**, **Referral**, and **Rewards**. Existing in-product mandatory truthfulness disclosures remain governed by locked ADRs.

## 7. Campaign roadmap: four distinct linked videos (NOT four 8-second clips total)

The Founder wants a **3–4-part connected promotional video series**, beginning with Video 1:

**Video 1 — Intro / Official Brand Launch** (current only; approximately four 8s scenes as a starting creative plan):
1. 8s scroll-stopping alien-tech awakening + cinematic original logo hero reveal; native Flow voice;
2. 8s trustworthy algorithmic platform identity/technology + native Flow voice, seamless from scene 1;
3. 8s high-impact ecosystem overview (plans, daily activity, wallet, payout, referral/rewards), native Flow voice;
4. 8s inspiring refined climax and `LIVE NOW — fixtradezone.com` CTA with prominent brand + native Flow voice.

**Video 2 — Plans / Daily Activity / Eligible Earnings:** accurate packages and published ranges, trading-activity versus settlement distinction, caps/eligibility, end CTA.

**Video 3 — Referrals / Team Business / Awards / Bonuses:** actual published qualified multi-level commission structures, rewards and conditions, CTA.

**Video 4 — How It Works / Wallet / Payout / Reinvestment:** user journey and USDT (BEP-20) operations, requirements, CTA.

Approximate durations are planning targets only. Use a larger number of 8-second scenes where needed for clarity. Every video should share a recognizable first-second brand feel, original logo consistency, coherent Flow-native narrator direction, matching music energy, and a definitive CTA. **Founder reviews Video 1 before Video 2, and every generated clip before continuing.**

## 8. Fully self-contained prompt contract (when Founder asks for a scene)

A ready-to-paste scene prompt must contain everything required for that individual Flow generation:
1. FixTradeZone name, correct and substantiated product positioning, logo exact filename, site, currency/network when relevant; no outside Project Facts block needed.
2. Exact format/duration and Flow-native narration requirement.
3. One explicit 8-second timed shot breakdown, including camera motion, palette, screen composition, sound design, **exact spoken words**, pacing, and music ducking.
4. Intro hook, connected previous scene, continuity last-frame intent for next 8-second scene. Later scenes preserve the previous approved clip's details rather than restart a new universe.
5. If any exact plan/commission/reward numbers appear, include **verified effective** values and their necessary restrictions, not `[ADD VERIFIED ...]` placeholders or fictional values; omit unverifiable figures.
6. Exact unchanged logo rule, no claim inflation, mobile readability.
7. Make it clear that clips are made and assessed one at a time. Founder never manually fills a separate facts template.

## 9. Review, acceptance, and repo workflow

- **Stage A:** Confirm current Agent Instructions, logo media reference, model, vertical ratio, 1 generation and remaining credits.
- **Stage B:** Generate **only first 8s intro scene**, with Flow-native voice + cinematic visuals.
- **Stage C:** Founder previews both picture and **audio**, then approves/rejects. If approved, note last-frame/lighting and precise narration style as continuity reference before next prompt.
- **Stage D:** Continue scene-by-scene, with native audio and smooth connection; assemble as supported by current Flow project tools. Any move to external editing or TTS must be approved.
- **Stage E:** Listen/watch complete joined film on mobile-sized playback, including cuts, exact original logo, audio speech presence and consistency, site/CTA spelling, true claims, clipping, black-frame gaps, and compliance.
- Documentation and creative review are not Postman/API tests. Do not claim API/local acceptance for them. No PR/merge to `main` without founder approval and relevant gates.
- Keep approved video/review decisions and any current prompt/scene continuity notes in repo docs for reliable handoff to new chats. Avoid putting session-local sandbox paths in repo as if they were permanent cloud assets.

### Fast continuation phrase for a new chat

> Read `docs/GOOGLE-FLOW-CINEMATIC-PRODUCTION.md` and `docs/MARKETING-TERMINOLOGY.md` on `docs/algorithm-generated-marketing-terminology` in `canzone-tech/fixtradezone`. Continue the currently approved FixTradeZone Flow cinematic video production **one 8-second scene at a time**, with the uploaded official `fixtradezone_final_logo.png`, Founder-requested (but claim-gated) phrase `Algorithm & AI-Based Trading Platform`, Flow-native voice, verified financial claims, and Founder approval after each clip. Do not start more prompts than requested.
