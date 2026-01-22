# BotRix-Style Alert System

This is a comprehensive alert system for your Kick chatbot with OBS integration, similar to BotRix.

## Features

- ✨ **Tiered Alerts** - Configure different alerts based on subscription tiers, tip amounts, raid sizes, etc.
- 🎨 **Custom Media** - Add custom images, videos, and sounds to each alert tier
- 📺 **OBS Integration** - Browser source overlay that connects via Server-Sent Events
- 🎯 **Real-time** - Alerts appear instantly when events occur on your stream
- 🎮 **Dashboard** - Full-featured web dashboard for managing alerts
- 🧪 **Test Mode** - Test any alert directly from the dashboard

## Setup Instructions

### 1. Install Dependencies

```bash
cd apps/bot
npm install
```

### 2. Run Database Migration

The new alert fields (imageUrl, videoUrl) need to be added to your database:

```bash
cd apps/bot
npm run db:generate
npm run db:migrate
```

### 3. Create Media Directory

The bot serves alert media from a static directory:

```bash
mkdir -p data/alerts
```

You can place your custom images, videos, and sounds in this directory.

### 4. Start the Bot

```bash
npm run dev
```

### 5. Set Up OBS

1. Open OBS Studio
2. Add a new **Browser Source** to your scene
3. Use this URL: `http://localhost:3001/alerts/overlay`
4. Recommended settings:
   - Width: 1920
   - Height: 1080
   - FPS: 60
   - ✅ Shutdown source when not visible
   - ✅ Refresh browser when scene becomes active

## Using the Alert System

### Creating Alerts

1. Navigate to the **Alerts** tab in the dashboard
2. Click **New Alert**
3. Configure your alert:
   - **Type**: Follow, Subscription, Gifted Sub, Raid, or Tip
   - **Min/Max Amount**: Define the tier range (e.g., 1-5 months, 6-12 months, etc.)
   - **Message**: Use variables like `{user}`, `{months}`, `{amount}`, etc.
   - **Media**: Add URLs for images, videos, and sounds
   - **Duration**: How long the alert displays (in milliseconds)

### Alert Variables

Each alert type supports different variables:

- **Follow**: `{user}`
- **Subscription**: `{user}`, `{months}`
- **Gifted Sub**: `{user}`, `{gifter}`, `{count}`
- **Raid**: `{user}`, `{viewers}`
- **Tip**: `{user}`, `{amount}`

### Media URLs

You can use URLs from any source:

- **Images**: Direct links to .gif, .png, .jpg, .webp
- **Videos**: Direct links to .mp4, .webm (video takes priority if both image and video are set)
- **Sounds**: Direct links to .mp3, .wav, .ogg

Example sources:
- Imgur: `https://i.imgur.com/xxxxx.gif`
- Giphy: `https://media.giphy.com/media/xxxxx/giphy.gif`
- Google Drive: Share publicly and use direct link
- Self-hosted: Place files in `data/alerts/` and use `http://localhost:3001/alerts/media/filename.gif`

### Testing Alerts

Click the **Play** button next to any alert in the dashboard to test it. The alert will appear in your OBS overlay and you can verify the timing, media, and message.

## Alert Tiers Example

Here's a common setup for subscriptions:

**Tier 1: 1-5 months**
- Message: "Thanks for subscribing, {user}! ({months} months)"
- Image: Celebration GIF
- Sound: Light chime
- Duration: 5000ms

**Tier 2: 6-12 months**
- Message: "{user} has been subscribed for {months} months! 🎉"
- Image: Bigger celebration GIF
- Sound: Louder fanfare
- Duration: 7000ms

**Tier 3: 13+ months**
- Message: "🔥 {user} is a LEGEND with {months} months! 🔥"
- Video: Epic celebration video
- Sound: Epic fanfare
- Duration: 10000ms

## API Endpoints

The alert system exposes these endpoints:

- `GET /alerts/overlay` - OBS browser source HTML
- `GET /api/alerts/stream` - Server-Sent Events stream for real-time alerts
- `POST /api/alerts/test` - Test an alert
- `POST /api/alerts/skip` - Skip the current alert
- `GET /api/alerts/queue` - View the alert queue
- `POST /api/alerts/clear-queue` - Clear all queued alerts

## Troubleshooting

### Alerts Not Showing in OBS

1. Check that the bot is running (`npm run dev`)
2. Verify the OBS browser source URL is correct
3. Right-click the browser source → Interact → Check browser console for errors
4. Make sure the browser source is visible in your scene

### Media Not Loading

1. Verify the media URL is publicly accessible
2. Check browser console for CORS errors
3. For local files, ensure they're in `data/alerts/` directory
4. Test the URL directly in a browser

### Events Not Triggering

1. Check that alerts are enabled in the dashboard
2. Verify you're authenticated with Kick
3. Check the bot logs for event messages
4. Test with the Test button in the dashboard first

## Advanced Configuration

### Custom Animations

You can customize the alert animations by editing `/apps/bot/src/alerts/overlay.html`. The file includes CSS animations for show/hide effects.

### Queue Management

Alerts are queued and displayed one at a time. You can:
- Skip the current alert via the dashboard
- Clear the entire queue
- View what's currently playing and what's queued

### Multiple Alert Tiers

You can create as many tiers as you want for each alert type. The system automatically selects the most specific tier based on the amount (highest minAmount that still matches).

## Support

For issues or questions, check the bot logs in the console. The alerts system logs all events, triggers, and errors.

Enjoy your new professional alert system! 🎉
