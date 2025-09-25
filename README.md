Om te runnen
npm run dev

om te deployen
npm run deploy


## Environment configuration

Create a `.env.local` file for development and `.env.production` for your
production deployment. With NextAuth you'll need at least the following keys:

```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=complex_random
BACKEND_JWT_SECRET=another_secret
```

Use your real production keys in the production file. Next.js will load the
appropriate file based on `NODE_ENV`.



## Retention Features (Keep Users Coming Back)
- [ ] Add a **Transcript Library** where users can save/search all past transcripts  
- [ ] Implement **Keyword Search** across saved Dutch transcripts  
- [ ] Enable **Highlights & Notes** so users can mark and comment on transcript sections  
- [ ] Add **Speaker Diarization** to automatically label and timestamp each speaker  
- [ ] Display basic **Speaker Talk-Time Analytics** for multi-speaker recordings  
- [ ] Integrate **Calendar Sync** to remind users before scheduled meetings  
- [ ] Send **Recap Emails** with the transcript, summary, and action items after each session  

## Premium Features (Upsells for Paid Tiers)
- [ ] Offer **Advanced Exports** (PDF, DOCX, SRT/VTT) for paid subscribers  
- [ ] Enforce **Tiered Audio Limits** (e.g., 10 min free vs. unlimited for Pro) and **Priority Processing**  
- [ ] Provide a **Custom Vocabulary** tool for adding domain-specific terms  
- [ ] Unlock **Advanced Summaries** (bulleted lists, topic outlines, auto-chapters)  
- [ ] Build an **Interactive Q&A Bot** to let users ask questions about their transcript  
- [ ] Add **Workflow Integrations** (e.g., Trello, Slack, Zapier) in the paid plan  
- [ ] Enable **Dutch→English Translation** of transcripts as a premium feature  

## UX Improvements (Smooth and Simple User Experience)
- [ ] Implement **Time-Synced Playback**: click any transcript line to play audio  
- [ ] Apply **Smart Formatting**: proper paragraphs, punctuation, speaker labels, and keyword highlights  
- [ ] Upgrade the word list into an **Interactive Keyword Cloud** with click-to-highlight  
- [ ] Add a **Filler-Word Filter** toggle to clean disfluencies from the transcript  
- [ ] Streamline **File Management**: drag-and-drop upload, clear progress bar, and one-click shareable links  
