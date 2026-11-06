# Patient view: what real users say they need

Date: 2026-11-06 · Input for the patient-view design ([mockup](../../../web/public/patient-mockup.html))

## How this was gathered

- **Reddit itself could not be read.** It blocks our search tool and the in-app browser.
- Instead, these notes use studies built on real users' words:
  - Reddit posts (a diabetes study of r/diabetes_t1)
  - app store reviews (1,803 reviews of mood apps for young people)
  - interviews with teens who have asthma
  - a trial of showing teens their own data
- Each finding names its source. Paraphrases are ours.

## Findings → what it means for our screen

| # | What users said | Source | What we do about it |
|---|---|---|---|
| 1 | **Keep it simple and quick.** Teens said that once an app has too many features, they stop wanting to use it every day. Simplicity and speed was the top theme in app reviews (34%). | Roberts 2018; Widnall 2020 | The default screen shows a few cards. Everything else lives in the "add a card" palette, not on screen. |
| 2 | **Charts help.** A 14-year-old said the chart let her "visualize how your asthma is doing". Reviewers valued seeing mood over time as a graph so they could spot patterns. | Roberts 2018; Widnall 2020 | The core cards stay: progress chart, mood by week, calendar. |
| 3 | **If the chart is hidden, it goes unseen.** In a trial with teens who have chronic pain, only 48% opened their visualizations, and some couldn't find them. | Boerner 2023 | Show the progress straight after the check-in is submitted, which is what the clinician heard from patients. Don't put it behind a tab. |
| 4 | **Not too childish.** Teens aged 15–16 called the child-styled app "kid-ish" and disliked its monsters. They did like colour and playfulness. They wanted to pick a theme colour, and 63% would like an avatar. | Roberts 2018 | Keep the tone friendly but not babyish. Emoji are fine, cartoons are not. A theme colour choice could come later. |
| 5 | **Useful beats pretty for staying.** 63% said the child app *looked* better, but 69% *preferred* the adult app because it tracked more. | Roberts 2018 | Each card should answer a real question ("am I getting better?"), not just decorate. |
| 6 | **Explain the chart in words.** Users want a short written explanation next to each visualization. | arXiv diabetes visualization study | Every chart gets a one-line plain sentence, e.g. "Your lung power is a bit lower than 2 weeks ago." |
| 7 | **Streaks motivate, but broken streaks make people quit.** After losing a streak, people were more likely to stop altogether. The suggested fixes: don't highlight a broken streak, let people repair it, or count weekly instead of daily. | Silverman et al. 2023 (J. Consumer Research), via Psychology Today | Lead with "5 of the last 7 days" or a weekly streak, not a fragile daily count. Add a streak "freeze" or "repair". Don't show "best ever" when it's far above today's streak. |
| 8 | **Numbers carry feelings.** People with type 1 diabetes post their "bad graphs" on Reddit, measured against a "flat line" ideal, to cope with how the data makes them feel. | Rentschler & Nothwehr (r/diabetes_t1, Aug 2022–Apr 2023) | Don't judge readings in red, especially in diabetes. Frame dips neutrally and suggest a next step ("Tell your care team if this keeps up"). |
| 9 | **Flexibility and sharing.** Reviewers asked to edit past entries, log more than once a day, use their own words, and share their data with family and doctors. | Widnall 2020 | Out of scope for the view, but a "your care team sees this too" line builds trust. |
| 10 | **Longer history.** Teens wanted to see 12 months of tracking, not just 3. | Roberts 2018 | Add a 1 month / 3 months / all time switch on the progress chart. |
| 11 | **Points and games are welcome.** One teen suggested points for each dose taken, and 94% would take quizzes. | Roberts 2018 | Badges and the next-goal card fit this. Rewards for doses can come later. |
| 12 | **First-time explanation.** Teens asked for a short tutorial or picture explanations on first use. | Roberts 2018 | A one-time "here's what these cards mean" overlay. |

## Gaps

- No source asked *children* directly what they want to see on their own data screen. The closest are the teen asthma interviews (#1–5, 10–12) and the chronic-pain trial (#3).
- No peer-reviewed trial of streaks in chronic-illness apps was found. Finding #7 comes from general consumer research.
- To get raw Reddit threads (r/Asthma, r/diabetes_t1, r/CysticFibrosis, r/ChronicIllness), someone needs to read them in their own browser.

## Sources

- Roberts C, et al. *Adolescent Preferences and Design Recommendations for an Asthma Self-Management App.* JMIR Form Res 2018. https://pmc.ncbi.nlm.nih.gov/articles/PMC6334705/
- Widnall E, et al. *User Perspectives of Mood-Monitoring Apps Available to Young People.* JMIR mHealth uHealth 2020. https://pmc.ncbi.nlm.nih.gov/articles/PMC7585773/
- Boerner KE, et al. *"Making Data the Drug": pilot trial of data visualization for pediatric chronic pain.* Children 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10452969/
- Rentschler C, Nothwehr B. *"Shitty Graphs": Data Intimacy and the Feeling of Numbers in Type 1 Diabetes* (abstract only). https://searchworks.jioinstitute.edu.in/articles/asx__176792080
- Information visualization for diabetes management (users want text alongside charts). https://arxiv.org/pdf/2007.12761v1.pdf
- Broken streaks and motivation (Silverman et al., summarized). https://www.psychologytoday.com/us/blog/ulterior-motives/202306/how-broken-streaks-sap-motivation
- Streak creep: when gamified engagement backfires. https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
