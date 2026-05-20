# EchoChat AI Chat Bot - Troubleshooting Guide

## ✅ Setup Verification Checklist

### 1. **API Key Configuration**
- [x] API Key added to `backend/.env`
- [x] API Key: `AIzaSyDdiHjAP57XRLvJLgi9GfeqSOk8maRg7kc`
- [ ] Verify key is active in Google AI Console
- [ ] Check API limits and quotas

### 2. **Backend Setup**
- [ ] Run: `cd backend && npm install` (to install @google/generative-ai)
- [ ] Check that `backend/src/routes/ai.route.js` exists
- [ ] Check that `backend/src/controllers/ai.controller.js` exists
- [ ] Verify `backend/src/server.js` has AI routes imported
- [ ] Backend running on port 5001: `npm run dev`

### 3. **Frontend Setup**
- [ ] Check `frontend/src/components/FloatingChatBot.jsx` exists
- [ ] Check `frontend/src/components/Layout.jsx` includes FloatingChatBot
- [ ] Frontend running on port 5173: `npm run dev`
- [ ] Check `frontend/src/lib/axios.js` for correct BASE_URL

### 4. **Authentication**
- [ ] User is logged in
- [ ] JWT cookie is present in browser
- [ ] Check browser DevTools > Application > Cookies for `jwt` cookie

---

## 🔧 Common Errors & Solutions

### Error: "401 Unauthorized - No token provided"
**Cause:** User is not logged in or JWT cookie is missing

**Solution:**
1. Make sure you're logged in
2. Check if `jwt` cookie exists in browser DevTools
3. Clear cookies and login again

```bash
# In browser DevTools Console:
document.cookie
```

---

### Error: "Failed to process your message"
**Cause:** Multiple possible reasons

**Solutions:**
1. Check if backend is running:
   ```bash
   curl http://localhost:5001/api/ai/chat
   ```

2. Check backend logs for specific errors:
   - Look for error messages in terminal where backend is running

3. Verify API key is correct:
   - Open `backend/.env`
   - Check `GEMINI_API_KEY` value

4. Test the API directly:
   ```bash
   curl -X POST http://localhost:5001/api/ai/chat \
     -H "Content-Type: application/json" \
     -H "Cookie: jwt=YOUR_TOKEN_HERE" \
     -d '{"message":"Hello","language":"en"}'
   ```

---

### Error: "Failed to install @google/generative-ai"
**Cause:** Missing npm package

**Solution:**
```bash
cd backend
npm install @google/generative-ai
```

---

### Chat Bot Button Not Showing
**Cause:** Component not rendered or imported incorrectly

**Solutions:**
1. Check that `Layout.jsx` imports FloatingChatBot:
   ```javascript
   import FloatingChatBot from "./FloatingChatBot";
   ```

2. Check that `FloatingChatBot` is rendered in Layout:
   ```javascript
   <FloatingChatBot />
   ```

3. Verify you're on a page that uses the Layout component

---

### API Key Not Working
**Cause:** 
- Invalid API key
- API not enabled in Google Cloud Console
- Rate limits exceeded

**Solutions:**
1. Get a new API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Update `backend/.env` with new key
3. Restart backend server
4. Try again

---

### Messages Show "Thinking..." But Never Respond
**Cause:**
- Backend not running
- Network request timing out
- API key invalid

**Solutions:**
1. Check terminal where backend is running
2. Verify no errors in backend logs
3. Check Network tab in DevTools:
   - Look for `/api/ai/chat` request
   - Check response status and body

---

## 🐛 Debugging Steps

### Step 1: Check Browser Console
Open browser DevTools (F12) → Console tab

Look for errors like:
```
POST http://localhost:5001/api/ai/chat 401 (Unauthorized)
```

### Step 2: Check Network Requests
DevTools → Network tab → Send a message

Expected flow:
1. `POST /api/ai/chat` → Status 200
2. Response includes `aiResponse` field

### Step 3: Check Backend Logs
Terminal running backend (`npm run dev`)

Expected output when message sent:
```
[no errors or proper Gemini API calls]
```

Errors to look for:
```
AI Chat Error: [error details]
Error in protectRoute middleware [error details]
```

### Step 4: Test API Endpoint Directly
```bash
# Get a JWT token first (login via frontend)
# Then run:

curl -X POST http://localhost:5001/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_JWT_TOKEN" \
  -d '{
    "message": "Hello",
    "language": "en"
  }'
```

---

## 🔄 Complete Reset

If everything is broken, try a complete reset:

```bash
# 1. Stop both frontend and backend

# 2. Clear node_modules and reinstall
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install

# 3. Verify .env has correct API key
cat backend/.env

# 4. Restart both servers
# Terminal 1 - Backend:
cd backend && npm run dev

# Terminal 2 - Frontend:
cd frontend && npm run dev
```

---

## 📋 Files Modified

**Backend:**
- ✅ `backend/.env` - Added GEMINI_API_KEY
- ✅ `backend/package.json` - Added @google/generative-ai
- ✅ `backend/src/controllers/ai.controller.js` - Created
- ✅ `backend/src/routes/ai.route.js` - Created
- ✅ `backend/src/server.js` - Added AI routes

**Frontend:**
- ✅ `frontend/src/components/FloatingChatBot.jsx` - Created & Fixed
- ✅ `frontend/src/components/Layout.jsx` - Updated to include ChatBot
- ✅ Uses `axiosInstance` from `frontend/src/lib/axios.js`

---

## 📞 Quick Support

**Issue:** Bot not responding
- Check: Is user logged in?
- Check: Backend running?
- Check: API key in .env?
- Check: npm install completed?

**Issue:** Getting 401 errors
- Cause: Not authenticated
- Fix: Login first

**Issue:** Getting 500 errors
- Cause: Backend error
- Check: Backend console logs
- Check: API key is valid

---

## ✨ Features Included

1. **AI Chat** - Ask questions, get AI responses
2. **Language Support** - 12+ languages
3. **Real-time Updates** - Messages appear instantly
4. **Error Handling** - Clear error messages with toast notifications
5. **Responsive Design** - Works on all screen sizes
6. **Authentication** - Protected routes, JWT verified
7. **Message History** - Keep track of conversation

---

## 🚀 Next Steps After Setup

1. Open dashboard/home page
2. Click floating chat button (bottom-right)
3. Select language
4. Start chatting!

Enjoy your AI assistant! 🎉
