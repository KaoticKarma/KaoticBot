import { useState } from 'react';

type DocSection = 
  | 'overview' 
  | 'commands' 
  | 'variables' 
  | 'timers' 
  | 'alerts' 
  | 'events' 
  | 'points' 
  | 'moderation' 
  | 'discord'
  | 'obs';

interface NavItem {
  id: DocSection;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '📖' },
  { id: 'commands', label: 'Commands', icon: '⌨️' },
  { id: 'variables', label: 'Variables', icon: '🔤' },
  { id: 'timers', label: 'Timers', icon: '⏱️' },
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'points', label: 'Points', icon: '💎' },
  { id: 'moderation', label: 'Moderation', icon: '🛡️' },
  { id: 'discord', label: 'Discord', icon: '💬' },
  { id: 'obs', label: 'OBS Setup', icon: '🎥' },
];

export default function Documentation() {
  const [activeSection, setActiveSection] = useState<DocSection>('overview');

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <aside className="w-56 flex-shrink-0">
        <div className="sticky top-0">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📚</span> Documentation
          </h2>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all text-sm ${
                  activeSection === item.id
                    ? 'bg-[#53fc18]/20 text-[#53fc18] border border-[#53fc18]/30'
                    : 'text-gray-300 hover:bg-[#2f2f35] hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl">
        {activeSection === 'overview' && <OverviewSection />}
        {activeSection === 'commands' && <CommandsSection />}
        {activeSection === 'variables' && <VariablesSection />}
        {activeSection === 'timers' && <TimersSection />}
        {activeSection === 'alerts' && <AlertsSection />}
        {activeSection === 'events' && <EventsSection />}
        {activeSection === 'points' && <PointsSection />}
        {activeSection === 'moderation' && <ModerationSection />}
        {activeSection === 'discord' && <DiscordSection />}
        {activeSection === 'obs' && <OBSSection />}
      </main>
    </div>
  );
}

// Reusable Components
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-bold text-white mb-4 pb-3 border-b border-[#2f2f35]">
      {children}
    </h1>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-[#53fc18] mb-3">{title}</h2>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-3 overflow-x-auto">
      <code className="text-[#53fc18] font-mono text-sm">{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="bg-[#1f1f23] text-[#53fc18] px-1.5 py-0.5 rounded font-mono text-sm">
      {children}
    </code>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#1f1f23]">
            {headers.map((header, i) => (
              <th key={i} className="text-left p-2 border border-[#2f2f35] text-[#53fc18] font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[#1f1f23]/50">
              {row.map((cell, j) => (
                <td key={j} className="p-2 border border-[#2f2f35] text-gray-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#53fc18]/10 border border-[#53fc18]/30 rounded-lg p-3 my-3">
      <p className="text-[#53fc18] font-semibold text-sm mb-1">💡 Tip</p>
      <p className="text-gray-300 text-sm">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 my-3">
      <p className="text-yellow-400 font-semibold text-sm mb-1">⚠️ Warning</p>
      <p className="text-gray-300 text-sm">{children}</p>
    </div>
  );
}

// Section Components
function OverviewSection() {
  return (
    <div>
      <SectionTitle>Welcome to KaoticBot</SectionTitle>
      
      <p className="text-gray-300 mb-4">
        KaoticBot is a powerful chat bot platform for Kick.com streamers. This documentation will help you 
        configure and get the most out of all the features available.
      </p>

      <SubSection title="Getting Started">
        <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
          <li>Connect your Kick account using the login button</li>
          <li>Enable the bot from the Dashboard</li>
          <li>Configure your commands, timers, and alerts</li>
          <li>Set up your OBS overlays for alerts</li>
          <li>Customize moderation settings to protect your chat</li>
        </ol>
      </SubSection>

      <SubSection title="Features Overview">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '⌨️', title: 'Custom Commands', desc: 'Create commands with variables and cooldowns' },
            { icon: '⏱️', title: 'Timers', desc: 'Automated messages at set intervals' },
            { icon: '🔔', title: 'Alerts', desc: 'Visual/audio alerts for OBS overlays' },
            { icon: '🎉', title: 'Event Messages', desc: 'Auto-messages for follows, subs, raids' },
            { icon: '💎', title: 'Loyalty Points', desc: 'Reward viewers with custom currency' },
            { icon: '🛡️', title: 'Moderation', desc: 'Filters, banned words, and auto-mod' },
            { icon: '💬', title: 'Discord', desc: 'Go-live notifications and webhooks' },
            { icon: '🎥', title: 'OBS Integration', desc: 'Browser source overlays' },
          ].map((feature) => (
            <div key={feature.title} className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-3">
              <div className="text-xl mb-1">{feature.icon}</div>
              <h3 className="font-semibold text-white text-sm mb-1">{feature.title}</h3>
              <p className="text-gray-400 text-xs">{feature.desc}</p>
            </div>
          ))}
        </div>
      </SubSection>
    </div>
  );
}

function CommandsSection() {
  return (
    <div>
      <SectionTitle>Commands</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Create custom chat commands that your viewers can use. Commands start with <InlineCode>!</InlineCode> by default.
      </p>

      <SubSection title="Creating a Command">
        <Table
          headers={['Field', 'Description', 'Example']}
          rows={[
            ['Name', 'The trigger word (without !)', 'socials'],
            ['Response', 'What the bot says (supports variables)', 'Follow me on Twitter: @example'],
            ['Cooldown', 'Seconds between uses (0 = no cooldown)', '10'],
            ['User Level', 'Minimum permission to use', 'everyone'],
            ['Aliases', 'Alternative triggers', 'social, links'],
          ]}
        />
      </SubSection>

      <SubSection title="Permission Levels">
        <Table
          headers={['Level', 'Description']}
          rows={[
            ['everyone', 'All viewers can use'],
            ['follower', 'Must be following the channel'],
            ['subscriber', 'Must be subscribed'],
            ['vip', 'Must have VIP badge'],
            ['moderator', 'Channel moderators only'],
            ['broadcaster', 'Only the streamer'],
          ]}
        />
      </SubSection>

      <SubSection title="Built-in Commands">
        <Table
          headers={['Command', 'Description']}
          rows={[
            ['!uptime', 'Shows how long the stream has been live'],
            ['!followage', 'Shows how long a user has been following'],
            ['!commands', 'Lists available commands'],
            ['!points', 'Shows your current points balance'],
            ['!leaderboard', 'Shows top point holders'],
          ]}
        />
      </SubSection>

      <Tip>
        Use aliases to create multiple triggers for the same command. For example, !socials, !social, and !links can all show your social media.
      </Tip>
    </div>
  );
}

function VariablesSection() {
  return (
    <div>
      <SectionTitle>Variables</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Variables make your commands dynamic by inserting real-time data. Use them in command responses, timer messages, and event messages.
      </p>

      <SubSection title="User Variables">
        <Table
          headers={['Variable', 'Description', 'Example Output']}
          rows={[
            ['$(user)', 'Username of who used the command', 'KaoticKarma'],
            ['$(touser)', 'Target user (first argument) or command user', 'TargetUser'],
            ['$(toname)', 'Same as $(touser)', 'TargetUser'],
            ['$(randomuser)', 'Random user from recent chat', 'RandomViewer'],
          ]}
        />
        
        <div className="mt-3">
          <p className="text-gray-400 text-sm mb-2">Example command:</p>
          <CodeBlock>!hug - $(user) gives $(touser) a big hug! 🤗</CodeBlock>
        </div>
      </SubSection>

      <SubSection title="Random Numbers">
        <CodeBlock>Rand[min,max]</CodeBlock>
        <p className="text-gray-400 text-sm mt-2 mb-2">Example - Random dice roll:</p>
        <CodeBlock>!roll - 🎲 $(user) rolled a Rand[1,6]!</CodeBlock>
      </SubSection>

      <SubSection title="Counters">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['$(counter name)', 'Shows current value of counter "name"'],
            ['$(counter name +)', 'Increments counter and shows new value'],
            ['$(counter name -)', 'Decrements counter and shows new value'],
            ['$(counter name +5)', 'Adds 5 to counter'],
            ['$(counter name =10)', 'Sets counter to 10'],
          ]}
        />
        <p className="text-gray-400 text-sm mt-2">Example - Death counter:</p>
        <CodeBlock>!death - ☠️ Deaths: $(counter deaths +)</CodeBlock>
      </SubSection>

      <SubSection title="Stream Variables">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['$(uptime)', 'Current stream duration'],
            ['$(viewers)', 'Current viewer count'],
            ['$(followers)', 'Total follower count'],
            ['$(game)', 'Current game/category'],
            ['$(title)', 'Current stream title'],
          ]}
        />
      </SubSection>
    </div>
  );
}

function TimersSection() {
  return (
    <div>
      <SectionTitle>Timers</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Timers automatically send messages to chat at set intervals. Great for reminders, social links, and keeping chat active.
      </p>

      <SubSection title="Creating a Timer">
        <Table
          headers={['Field', 'Description', 'Example']}
          rows={[
            ['Name', 'Identifier for the timer', 'socials'],
            ['Message', 'What to send (supports variables)', 'Follow me on Twitter!'],
            ['Interval', 'Minutes between messages', '15'],
            ['Min Chat Lines', 'Required chat activity before triggering', '5'],
            ['Enabled', 'Turn timer on/off', 'On'],
          ]}
        />
      </SubSection>

      <SubSection title="How Timers Work">
        <p className="text-gray-300 text-sm mb-2">
          Timers check two conditions before sending:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm">
          <li>The interval time has passed since the last message</li>
          <li>At least X chat messages have been sent (configurable)</li>
        </ol>
        <p className="text-gray-400 text-sm mt-2">
          This prevents spam during slow chat periods.
        </p>
      </SubSection>

      <Warning>
        Setting intervals too short (under 5 minutes) can annoy viewers. Aim for 15-30 minutes between automated messages.
      </Warning>
    </div>
  );
}

function AlertsSection() {
  return (
    <div>
      <SectionTitle>Alerts</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Alerts display visual and audio notifications in your OBS overlay when events happen (follows, subs, raids, etc.).
      </p>

      <SubSection title="Alert Types">
        <Table
          headers={['Type', 'Trigger', 'Variables Available']}
          rows={[
            ['Follow', 'New follower', '$(user)'],
            ['Subscribe', 'New or renewed subscription', '$(user), $(months), $(tier)'],
            ['Gift Sub', 'Gifted subscription', '$(user), $(recipient), $(amount), $(tier)'],
            ['Raid', 'Incoming raid', '$(user), $(viewers)'],
            ['Kick', 'Channel kick donation', '$(user), $(amount), $(message)'],
          ]}
        />
      </SubSection>

      <SubSection title="Configuring Alerts">
        <Table
          headers={['Setting', 'Description']}
          rows={[
            ['Message', 'Text shown in the alert (supports variables)'],
            ['Image/GIF', 'Visual displayed during alert'],
            ['Video', 'Video file to play (MP4, WebM)'],
            ['Sound', 'Audio file to play (MP3, WAV, OGG)'],
            ['Duration', 'How long alert displays (milliseconds)'],
            ['Min Amount', 'Minimum trigger amount (for tiered alerts)'],
            ['Max Amount', 'Maximum amount for this tier'],
          ]}
        />
      </SubSection>

      <SubSection title="Tiered Alerts">
        <p className="text-gray-300 text-sm mb-2">
          Create different alerts based on amounts. For example, gift subs:
        </p>
        <div className="space-y-1 text-sm">
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-2">
            <span className="text-[#53fc18]">1-4 gifts:</span>
            <span className="text-gray-300 ml-2">Standard celebration</span>
          </div>
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-2">
            <span className="text-[#53fc18]">5-9 gifts:</span>
            <span className="text-gray-300 ml-2">Bigger animation + special sound</span>
          </div>
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-2">
            <span className="text-[#53fc18]">10+ gifts:</span>
            <span className="text-gray-300 ml-2">Epic full-screen animation</span>
          </div>
        </div>
      </SubSection>

      <Tip>
        Use the "Test Alert" button to preview your alerts without waiting for real events!
      </Tip>
    </div>
  );
}

function EventsSection() {
  return (
    <div>
      <SectionTitle>Event Messages</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Event messages are automatic chat messages sent when specific events happen. Unlike alerts (visual overlays), 
        these appear directly in your Kick chat.
      </p>

      <SubSection title="Available Events">
        <Table
          headers={['Event', 'When It Triggers', 'Available Variables']}
          rows={[
            ['Follow', 'Someone follows your channel', '$(user)'],
            ['Subscribe', 'New subscription', '$(user), $(months), $(tier)'],
            ['Gift Sub', 'Someone gifts subs', '$(user), $(recipient), $(amount)'],
            ['Raid', 'Another streamer raids you', '$(user), $(viewers)'],
            ['Kick', 'Kick donation received', '$(user), $(amount), $(message)'],
          ]}
        />
      </SubSection>

      <SubSection title="Example Messages">
        <div className="space-y-3">
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-3">
            <p className="text-[#53fc18] font-semibold text-sm mb-1">Follow Event</p>
            <CodeBlock>Welcome to the squad, $(user)! 🎉 Thanks for the follow!</CodeBlock>
          </div>
          
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-3">
            <p className="text-[#53fc18] font-semibold text-sm mb-1">Raid Event</p>
            <CodeBlock>🚨 RAID! $(user) is raiding with $(viewers) viewers! Welcome raiders!</CodeBlock>
          </div>
        </div>
      </SubSection>

      <Tip>
        Event messages and alerts work together! Use event messages for chat acknowledgment and alerts for visual celebration.
      </Tip>
    </div>
  );
}

function PointsSection() {
  return (
    <div>
      <SectionTitle>Loyalty Points</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Reward your viewers with a custom loyalty point system. Viewers earn points by watching and chatting, 
        then can use them for rewards you define.
      </p>

      <SubSection title="Point Settings">
        <Table
          headers={['Setting', 'Description', 'Default']}
          rows={[
            ['Currency Name', 'What to call your points', 'Points'],
            ['Points Per Message', 'Points earned per chat message', '5'],
            ['Points Per Minute', 'Points earned while watching', '1'],
            ['Sub Multiplier', 'Bonus multiplier for subscribers', '2.0x'],
          ]}
        />
      </SubSection>

      <SubSection title="Built-in Commands">
        <Table
          headers={['Command', 'Description']}
          rows={[
            ['!points', 'Check your current balance'],
            ['!points @user', 'Check another user\'s balance'],
            ['!leaderboard', 'Show top 10 point holders'],
            ['!gamble [amount]', 'Gamble your points (if enabled)'],
          ]}
        />
      </SubSection>

      <Tip>
        Create fun names for your points that match your brand! Examples: "Chaos Coins", "Karma Points", "Squad Bucks"
      </Tip>
    </div>
  );
}

function ModerationSection() {
  return (
    <div>
      <SectionTitle>Moderation</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Protect your chat with automated moderation filters. The bot can automatically delete messages, 
        timeout, or ban users based on your rules.
      </p>

      <SubSection title="Moderation Filters">
        <Table
          headers={['Filter', 'What It Catches', 'Example']}
          rows={[
            ['Link Filter', 'URLs and links', 'google.com, bit.ly/xyz'],
            ['Caps Filter', 'Excessive capital letters', 'STOP YELLING AT ME'],
            ['Spam Filter', 'Repeated characters/words', 'LOLOLOLOLOL, spam spam'],
            ['Symbol Filter', 'Excessive symbols/emotes', '!!!!!????!!!!'],
            ['Banned Words', 'Custom blocked phrases', 'Bad word, slur'],
          ]}
        />
      </SubSection>

      <SubSection title="Filter Actions">
        <Table
          headers={['Action', 'Description']}
          rows={[
            ['Delete', 'Silently remove the message'],
            ['Timeout', 'Timeout user (configurable duration)'],
            ['Ban', 'Permanently ban the user'],
          ]}
        />
      </SubSection>

      <SubSection title="Permit System">
        <p className="text-gray-300 text-sm mb-2">
          Temporarily allow users to bypass filters:
        </p>
        <CodeBlock>!permit @username 60</CodeBlock>
        <p className="text-gray-400 text-sm mt-2">
          This gives the user 60 seconds to post links without being filtered.
        </p>
      </SubSection>

      <Warning>
        Be careful with short banned words - they might match parts of innocent words!
      </Warning>
    </div>
  );
}

function DiscordSection() {
  return (
    <div>
      <SectionTitle>Discord Integration</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Send automatic notifications to your Discord server when you go live or end your stream.
      </p>

      <SubSection title="Setting Up">
        <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
          <li>Add the KaoticBot Discord bot to your server</li>
          <li>Select your server and notification channel in settings</li>
          <li>Customize your go-live message</li>
          <li>Enable notifications</li>
        </ol>
      </SubSection>

      <SubSection title="Go-Live Notifications">
        <p className="text-gray-300 text-sm mb-2">
          When your stream goes live, the bot sends a rich embed to Discord with:
        </p>
        <ul className="list-disc list-inside text-gray-400 text-sm space-y-1">
          <li>Stream title and category</li>
          <li>Stream thumbnail/screenshot</li>
          <li>Direct link to your channel</li>
          <li>Optional @everyone or role ping</li>
        </ul>
      </SubSection>

      <SubSection title="Stream End Summary">
        <p className="text-gray-300 text-sm mb-2">
          When your stream ends, get a summary with stats:
        </p>
        <ul className="list-disc list-inside text-gray-400 text-sm space-y-1">
          <li>Stream duration</li>
          <li>Peak viewer count</li>
          <li>Total chat messages</li>
          <li>New followers gained</li>
        </ul>
      </SubSection>

      <Tip>
        Use role mentions instead of @everyone to only notify people who opted in to stream notifications!
      </Tip>
    </div>
  );
}

function OBSSection() {
  return (
    <div>
      <SectionTitle>OBS Setup</SectionTitle>
      
      <p className="text-gray-300 mb-4 text-sm">
        Set up browser sources in OBS to display alerts on your stream.
      </p>

      <SubSection title="Adding the Alert Overlay">
        <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
          <li>Open OBS Studio</li>
          <li>In your scene, click <strong>+</strong> under Sources</li>
          <li>Select <strong>Browser</strong></li>
          <li>Name it "KaoticBot Alerts" and click OK</li>
          <li>Enter your overlay URL (found in Dashboard → Alerts → OBS URL)</li>
          <li>Set Width: <strong>1920</strong> and Height: <strong>1080</strong></li>
          <li>Check "Refresh browser when scene becomes active"</li>
          <li>Click OK</li>
        </ol>
      </SubSection>

      <SubSection title="Overlay URL">
        <p className="text-gray-300 text-sm mb-2">
          Your unique overlay URL looks like:
        </p>
        <CodeBlock>http://localhost:3000/alerts/overlay?token=YOUR_UNIQUE_TOKEN</CodeBlock>
        <p className="text-gray-400 text-sm mt-2">
          Find this URL in your Alerts settings page. Keep your token private!
        </p>
      </SubSection>

      <SubSection title="Recommended Settings">
        <Table
          headers={['Setting', 'Value']}
          rows={[
            ['Width', '1920'],
            ['Height', '1080'],
            ['FPS', '60'],
            ['Shutdown when not visible', 'Unchecked'],
            ['Refresh when scene active', 'Checked'],
          ]}
        />
      </SubSection>

      <SubSection title="Troubleshooting">
        <Table
          headers={['Problem', 'Solution']}
          rows={[
            ['Alerts not showing', 'Check the URL is correct and bot is running'],
            ['No sound', 'Enable "Control audio via OBS" in browser source'],
            ['Choppy animations', 'Increase browser source FPS to 60'],
            ['Alert stuck', 'Refresh the browser source (right-click → Refresh)'],
          ]}
        />
      </SubSection>

      <Warning>
        Never share your overlay URL publicly! It contains a unique token that identifies your account.
      </Warning>
    </div>
  );
}
