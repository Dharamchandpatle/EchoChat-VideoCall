# AI Chat Bot Setup Guide

## Overview
The floating AI chat bot has been added to your EchoChat application. It uses Google's Gemini AI to handle:
- **Query responses** - Answer user questions
- **Language translation** - Translate text between multiple languages  
- **Language detection** - Identify the language of input text

## Setup Steps

### 1. Get Gemini API Key
- Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
- Click "Create API Key"
- Copy the generated API key

### 2. Update Backend Configuration
Edit `backend/.env` and add your Gemini API key:

```
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Install Dependencies
In the backend directory, install the new Gemini package:

```bash
cd backend
npm install
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Features

### Floating Chat Bot
The chat bot appears as a floating button in the bottom-right corner of the screen.

**Features:**
- Click the button to open/close the chat window
- Send messages for AI responses
- Select your preferred language from the dropdown
- Real-time message streaming with timestamps
- Automatic message history
- Loading indicators while waiting for responses

### API Endpoints

#### 1. Chat with AI
**POST** `/api/ai/chat`
```json
{
  "message": "Your question here",
  "language": "en"
}
```

#### 2. Translate Text
**POST** `/api/ai/translate`
```json
{
  "text": "Text to translate",
  "targetLanguage": "es",
  "sourceLanguage": "auto"
}
```

#### 3. Detect Language
**POST** `/api/ai/detect-language`
```json
{
  "text": "Text to analyze"
}
```

## Supported Languages
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Japanese (ja)
- Korean (ko)
- Chinese Simplified (zh)
- Hindi (hi)
- Arabic (ar)

## Files Modified/Created

### Backend
- `backend/.env` - Added `GEMINI_API_KEY`
- `backend/package.json` - Added `@google/generative-ai` dependency
- `backend/src/controllers/ai.controller.js` - New AI controller with three functions:
  - `chatWithAI()` - Handle chat queries
  - `translateText()` - Translate between languages
  - `detectLanguage()` - Detect input language
- `backend/src/routes/ai.route.js` - New AI routes with auth protection
- `backend/src/server.js` - Integrated AI routes

### Frontend
- `frontend/src/components/FloatingChatBot.jsx` - New floating chat bot component
- `frontend/src/components/Layout.jsx` - Integrated chat bot into layout

## Usage Example

Users will see a floating chat button in the bottom-right corner:
1. Click the button to open the chat window
2. Select their preferred language
3. Type a query or message
4. The AI will respond in the selected language
5. They can ask follow-up questions, translate text, or get language understanding

## Troubleshooting

### "Failed to process your message"
- Ensure `GEMINI_API_KEY` is set correctly in `.env`
- Check that the API key is valid and not revoked
- Verify the backend is running on `http://localhost:5001`

### Messages not sending
- Make sure you're logged in (authentication required)
- Check browser console for errors
- Verify frontend is running on `http://localhost:5173`

### API Key errors
- Regenerate your API key from Google AI Studio
- Update the `.env` file with the new key
- Restart the backend server

## Future Enhancements
- Add chat history persistence
- Implement advanced language models
- Add voice-to-text input
- Create conversation memory
- Add sentiment analysis
