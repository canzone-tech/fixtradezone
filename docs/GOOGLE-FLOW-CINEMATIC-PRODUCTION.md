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

## 10. Video 1 — Scene 1 generation and Founder approval (2026-10-08)

**APPROVED / COMPLETED — first attempt in Google Flow, 8 seconds, portrait 9:16.**

- Founder supplied Google Flow player/timeline screenshots showing a midnight navy technology chamber, electric-cyan central lightning and particle buildup, cyan/purple rings and light beams, and a center-stage FixTradeZone logo hero reveal around seconds 5–8.
- Founder feedback, verbatim: **"Bingo Perfect in first try bro with powerfull voice"**. Treat this as explicit approval of the **first generated intro scene's overall appearance and Flow-native narration**. Do not claim the assistant personally listened to the audio; approval is from the Founder.
- The logo appears in the final screenshots centered above a stepped futuristic platform. The approx. 7–8s final frame is a glowing cyan logo square against a dark, hexagonal/geometric environment. Use this end-frame composition as the reference for Scene 2 continuation, not a new independent opening.
- No local copy of the generated 8-second MP4 was supplied in this approval turn, only screenshots. Before precise final-frame extension, scene matching, or full audio QA, ask Founder to download/preserve and, if needed, upload the original Google Flow MP4. No external-sound merge is authorized.
- Preserve the same **warm deep male cinema-narrator quality**, voice prominence, dramatic but subordinate score, cyan/navy/purple visual palette and established art direction. Exact voice identity on subsequent separate generations is not guaranteed; the Founder must review continuity and audio before approval.
- **Next stage when Founder explicitly requests it:** one copy-paste-ready Video 1 / Scene 2 8-second prompt; match Scene 1's end-frame and include a short, fully intelligible Flow-native spoken line. Do not jump to Video 2 or generate multiple scenes without review.
- Screenshot-only verification is insufficient for precise original PNG/logo pixel fidelity or independent confirmation of voice; those remain review checks for final master.

## 11. Video 1 — Scene 2 Founder approval and transition note (2026-10-08)

**APPROVED / COMPLETED IN GOOGLE FLOW — Video 1, Scene 2, the 8-second technology/platform continuation.**

- Founder feedback (translated faithfully from Hinglish): **Second scene is perfect**, but the connection/hook between Scene 1 and Scene 2 was **not entirely smooth**. Founder explicitly accepts the minor seam for now ("thoda sa hooks smoth nahi tha but chalega").
- **Do not rewrite or regenerate Scenes 1–2 solely because of this minor seam.** Keep both as approved takes. At the final joined-video QA stage, inspect the splice; if useful and supported by available Flow timeline tools, a tiny overlap, match-on-motion or short audio crossfade may soften it **without losing speech or corrupting logo**. Do not promise a guaranteed seamless fix, assume external editing is permitted, or add unsupported audio tools.
- Maintain the same approved Hollywood/alien-tech midnight-navy, cyan and subtle purple world, official `fixtradezone_final_logo.png`, premium male Flow-native voice and music-under-voice principle.
- **Next stage only when Founder asks:** Video 1 / Scene 3 (8 seconds), an interconnected overview of packages, algorithm-generated daily activity, qualified earnings settlement, wallet, payout/reinvestment and referrals/rewards; pick a restrained subset for readable 8-second visuals. Request current last-frame/screenshot or source video if precise camera/visual continuity is required. Short spoken words must fit comfortably inside the clip. Use self-contained copy-paste prompt and do not invent returns, balances or AI trading capabilities.
- Founder approval is based on direct Flow playback by the Founder, **not independent audio or MP4 verification by assistant**. Keep final export/voice/logotype QA pending.

## 12. Video 1 — Scene 3 Founder approval and mandatory Trading-word correction (2026-10-08)

**APPROVED / COMPLETED IN GOOGLE FLOW — Scene 3, 8 seconds, platform ecosystem.**

- Founder directly reviewed generated Scene 3 and described it as **"perfect ban gaya"**.
- Founder spotted an important **marketing wording omission**: Scene 3 showed/said **"Daily Activity"** but did **not** use the word **"Trading"** anywhere in that scene.
- **Do not treat "Daily Activity" alone as the best final promotional explanation of trading.** The accurate preferred full product-process terminology remains **"Algorithm-Generated Trade Activity"**; **"Algorithm-Based Trading Technology"** is also acceptable as a truthful platform-technology phrase. A shorter public-facing **"Daily Trading Activity"** may be used only in context that explains the activity is generated internally, not broker/exchange execution.
- **Founder has not requested a Scene 3 regeneration.** Preserve its approved visuals and Flow-native voice. Avoid wasting credits solely on one label; include the key word **"Trading"** naturally and prominently in **Scene 4's on-screen marketing copy and/or spoken line**, provided timing permits and it does not distort the product truth.
- **Scene 4 is not yet generated or approved.** When Founder asks for its prompt, include explicit Trading reference, grand finale, exact original `fixtradezone_final_logo.png` hero, **LIVE NOW — fixtradezone.com** closing CTA, same Hollywood/alien-tech look and Flow-generated deep clear male narrator. Preserve cinematic visual/audio continuity from Scene 3's actual ending (request end-frame if needed); avoid false "AI engine", exchange execution, guaranteed returns or fabricated earnings.
- Full joined-video mobile audio quality, smooth splices, original-logo fidelity, accurate typography and CTA spelling remain pending final QA.

## 13. Video 1 — Scene 4 Founder approval with duplicated end-card branding (2026-10-08)

**FOUNDER-APPROVED SCENE 4, WITH MINOR FINAL-END-CARD COPY ISSUE TO REVIEW BEFORE PUBLISHING.**

- The Founder reviewed Flow-generated Scene 4 and explicitly approved the scene's overall result ("approve to hai").
- Reported defect: toward the end, **FixTradeZone appears twice**; the **second instance lacks `.com`**. The exact on-screen layout and whether the second text is replacing the intended URL are NOT independently verified; obtain a final-frame screenshot or source MP4 before choosing a correction.
- Expected clean end frame: **exact unaltered original `fixtradezone_final_logo.png`** (its included wordmark is permitted), one short **`LIVE NOW`** label, and one clearly legible website CTA **`fixtradezone.com`**; **no extra loose `FixTradeZone` label without `.com`**. Do not duplicate an extra brand wordmark outside the original logo.
- Founder has not requested regenerating or rejecting Scene 4. **Avoid automatically spending Flow credits.** First check screenshot: if correct URL already remains clearly visible and only a harmless logo wordmark is repeated, consider accepting. If the website is incorrect/missing or a confusing duplicate label is prominent, consider the minimal Flow editing/trimming/regeneration option subject to Founder approval and the UI's actual capabilities.
- Keep **Google Flow native cinematic voice** and approved audio intact; any fix must avoid cutting speech or obscuring the CTA. Full compiled Video 1 (four approx. 8-second scenes, ~32s) still needs mobile playback and final upload/export QA.
- The Founder has not approved beginning Video 2 yet. Save 1080p exported video for the approved first campaign before advancing.

## 14. Video 1 — Screenshot-confirmed end-card duplication and voice approval (2026-10-08)

- Founder uploaded Google Flow screenshot sequence of the assembled **32-second** intro (near **29–32s**) and explicitly confirmed: **"voice perfect hai"**. The Flow-native voice is Founder-approved across the assembled promo; preserve it during any visual fix. The assistant has not independently played/heard the MP4.
- **Visual bug confirmed from screenshots:** around ~29–31s the final display shows the cyan hexagonal logo with the regular **FixTradeZone** wordmark directly beneath it and then a **second free-floating "FixTradeZone" text line below**. The extra lower line is **not** `fixtradezone.com`. No visible `LIVE NOW` website CTA is present in the supplied ending frames.
- **Desired correction (only final ~2–3 seconds):** preserve exact approved top logo/wordmark, all preceding cinematic footage, audio/voice and color palette; replace the **lower duplicate text line** with the precisely spelled **`fixtradezone.com`**; include a small clear **`LIVE NOW`** above the URL where visual space allows. Do not add another brand name, distort or redraw the original logo, or obscure mobile safe areas.
- **Recommended minimal-risk workflow:** save an original 1080p master backup first. Explore whether current Google Flow's end-scene editing can isolate just the end-card. Changing a full composite via generative edit may impact voice, logo or other scenes and can consume credits; require founder approval and a visible preview/cost before proceeding. Do not regenerate the entire 32-second film or use external audio workflow by default. If precise original logo/text control cannot be achieved natively, explain constraints and ask before proposing editor/compositing alternatives.
- Do not declare the first public film publishing-ready until the correct website CTA is visible and spelled accurately in the last frame. Visual source was screenshot-only, not uploaded raw MP4.

## 15. Scene 4 — additional 1.8–3.2s Team Rewards visual/audio sync correction (2026-10-08)

- Founder confirmed downloading a backup of Scene 4 and identified a **second visual-only error** in the Google Flow 8-second Scene 4.
- Existing clear Flow-native narration: approximately **0–1.8s “Trading technology.”**, followed by approximately **1.8–3.2s “Team rewards.”** However, the video continues to show **TRADING TECHNOLOGY** graphics during the “Team rewards” spoken segment. Founder requests **TEAM REWARDS** on-screen in that section, synchronized exactly to existing narration.
- Screenshot frames of the first 2 seconds also appear to render “TRADING TECHNOLOGY” with possible missing/malformed letters; require exact **TRADING TECHNOLOGY** spelling.
- **Combined desired Scene 4 visual timing, without any voice/music change:** 0–1.8s “TRADING TECHNOLOGY”; 1.8–3.2s “TEAM REWARDS”; 3.2–5.2s the approved original logo reveal; 5.2–8.0s original logo/wordmark plus **LIVE NOW** and **fixtradezone.com**, replacing the duplicate lower “FixTradeZone” label. All timing is approximate and must follow actual spoken cues.
- The user wants **only the 8-second Scene 4** edited, not the previously approved three scenes. They have not executed the combined correction prompt yet in this turn. Flow video-edit prompts **may regenerate visuals/audio**, so do not claim exact preservation without post-generation listening and founder review; backup remains authoritative if the edit damages the accepted narration.

## 16. Video 1 — combined 32-second timeline status and remaining junction jerk (2026-10-08)

- Founder reports that **all four generated intro clips have been added together in one Google Flow scene/timeline**, approx. **32 seconds total**.
- Latest feedback: **the result is perfect apart from a slight visual jerk only at the Scene 1 → Scene 2 splice**. All other joins and elements were described as perfect. Treat this as Founder acceptance of the combined production with **one remaining cosmetic join issue**, not independent MP4 certification.
- Earlier Scene 4 issues were Team Rewards speech/title sync and duplicate `FixTradeZone` lower text instead of `fixtradezone.com`. Founder described the updated joined film as "baki perfect"; **do not assert the exact corrected final CTA is verified by the assistant without seeing new exported frames or video**. At final export review, specifically check the exact `LIVE NOW` and `fixtradezone.com` visual text.
- **Do not regenerate approved scenes merely for a slight join jerk; retain the accepted Flow-native voice.** If the actual Google Flow scene UI exposes a transition control, optionally test only a very short subtle blend/match-on-motion around the Scene 1/2 boundary, making sure no audio double-voice, clipping, logo ghosting or black frame is introduced. Do not claim Flow exposes a dedicated crossfade control unless observed. Otherwise leave the acceptable join and preserve the approved 32-second video.
- Preserve original 1080p downloads and perform a final complete listen/watch pass before publishing: voice clarity, continuity, CTA text, accurate logo and mobile 9:16 framing. Next detailed promotional video is a separate Founder-approved step.
