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
    <div className="min-h-screen bg-[#0e0e10] text-white">
      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 min-h-screen bg-[#18181b] border-r border-[#2f2f35] sticky top-0">
          <div className="p-4 border-b border-[#2f2f35]">
            <h2 className="text-xl font-bold text-[#53fc18] flex items-center gap-2">
              <span>📚</span> Documentation
            </h2>
          </div>
          <nav className="p-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg mb-1 flex items-center gap-3 transition-all ${
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
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 max-w-4xl">
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
    </div>
  );
}

// Reusable Components
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-3xl font-bold text-white mb-6 pb-4 border-b border-[#2f2f35]">
      {children}
    </h1>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-[#53fc18] mb-4">{title}</h2>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4 overflow-x-auto">
      <code className="text-[#53fc18] font-mono text-sm">{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="bg-[#1f1f23] text-[#53fc18] px-2 py-1 rounded font-mono text-sm">
      {children}
    </code>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#1f1f23]">
            {headers.map((header, i) => (
              <th key={i} className="text-left p-3 border border-[#2f2f35] text-[#53fc18] font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[#1f1f23]/50">
              {row.map((cell, j) => (
                <td key={j} className="p-3 border border-[#2f2f35] text-gray-300">
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
    <div className="bg-[#53fc18]/10 border border-[#53fc18]/30 rounded-lg p-4 my-4">
      <p className="text-[#53fc18] font-semibold mb-1">💡 Tip</p>
      <p className="text-gray-300">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 my-4">
      <p className="text-yellow-400 font-semibold mb-1">⚠️ Warning</p>
      <p className="text-gray-300">{children}</p>
    </div>
  );
}

// Section Components
function OverviewSection() {
  return (
    <div>
      <SectionTitle>Welcome to KaoticBot</SectionTitle>
      
      <p className="text-gray-300 text-lg mb-6">
        KaoticBot is a powerful chat bot platform for Kick.com streamers. This documentation will help you 
        configure and get the most out of all the features available.
      </p>

      <SubSection title="Getting Started">
        <ol className="list-decimal list-inside space-y-3 text-gray-300">
          <li>Connect your Kick account using the login button</li>
          <li>Enable the bot from the Dashboard</li>
          <li>Configure your commands, timers, and alerts</li>
          <li>Set up your OBS overlays for alerts</li>
          <li>Customize moderation settings to protect your chat</li>
        </ol>
      </SubSection>

      <SubSection title="Features Overview">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div key={feature.title} className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
              <div className="text-2xl mb-2">{feature.icon}</div>
              <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
              <p className="text-gray-400 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </SubSection>

      <SubSection title="Quick Links">
        <div className="flex flex-wrap gap-3">
          <a href="#" className="bg-[#53fc18] text-black px-4 py-2 rounded-lg font-semibold hover:bg-[#4ae615] transition-colors">
            Dashboard
          </a>
          <a href="#" className="bg-[#1f1f23] border border-[#2f2f35] text-white px-4 py-2 rounded-lg hover:bg-[#2f2f35] transition-colors">
            Commands
          </a>
          <a href="#" className="bg-[#1f1f23] border border-[#2f2f35] text-white px-4 py-2 rounded-lg hover:bg-[#2f2f35] transition-colors">
            Alerts
          </a>
        </div>
      </SubSection>
    </div>
  );
}

function CommandsSection() {
  return (
    <div>
      <SectionTitle>Commands</SectionTitle>
      
      <p className="text-gray-300 mb-6">
        Create custom chat commands that your viewers can use. Commands start with <InlineCode>!</InlineCode> by default.
      </p>

      <SubSection title="Creating a Command">
        <p className="text-gray-300 mb-4">
          Navigate to the Commands page and click "Add Command". Each command needs:
        </p>
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
        <p className="text-gray-300 mb-4">
          Commands can be restricted to certain user levels:
        </p>
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
        <p className="text-gray-300 mb-4">
          These commands work out of the box:
        </p>
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
      
      <p className="text-gray-300 mb-6">
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
        
        <div className="mt-4">
          <p className="text-gray-400 mb-2">Example command:</p>
          <CodeBlock>!hug - $(user) gives $(touser) a big hug! 🤗</CodeBlock>
          <p className="text-gray-400 mt-2">When KaoticKarma types <InlineCode>!hug StreamerFan</InlineCode>:</p>
          <CodeBlock>KaoticKarma gives StreamerFan a big hug! 🤗</CodeBlock>
        </div>
      </SubSection>

      <SubSection title="Random Numbers">
        <p className="text-gray-300 mb-4">
          Generate random numbers in a range:
        </p>
        <CodeBlock>Rand[min,max]</CodeBlock>
        
        <div className="mt-4">
          <p className="text-gray-400 mb-2">Example - Random dice roll:</p>
          <CodeBlock>!roll - 🎲 $(user) rolled a Rand[1,6]!</CodeBlock>
          <p className="text-gray-400 mt-2">Output:</p>
          <CodeBlock>🎲 KaoticKarma rolled a 4!</CodeBlock>
        </div>

        <div className="mt-4">
          <p className="text-gray-400 mb-2">Example - Random percentage:</p>
          <CodeBlock>!love - 💕 $(user) loves $(touser) Rand[1,100]%!</CodeBlock>
        </div>
      </SubSection>

      <SubSection title="Counters">
        <p className="text-gray-300 mb-4">
          Counters track and increment values that persist across uses:
        </p>
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

        <div className="mt-4">
          <p className="text-gray-400 mb-2">Example - Death counter:</p>
          <CodeBlock>!death - ☠️ Deaths: $(counter deaths +)</CodeBlock>
          <p className="text-gray-400 mt-2">Each use increments and displays the death count.</p>
        </div>
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

      <Tip>
        Variables can be combined! Try: <InlineCode>$(user) has been following for $(followage) and has $(points) points!</InlineCode>
      </Tip>
    </div>
  );
}

function TimersSection() {
  return (
    <div>
      <SectionTitle>Timers</SectionTitle>
      
      <p className="text-gray-300 mb-6">
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
        <p className="text-gray-300 mb-4">
          Timers check two conditions before sending:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>The interval time has passed since the last message</li>
          <li>At least X chat messages have been sent (configurable)</li>
        </ol>
        <p className="text-gray-300 mt-4">
          This prevents spam during slow chat periods.
        </p>
      </SubSection>

      <SubSection title="Timer Ideas">
        <div className="grid gap-4">
          {[
            { name: 'Social Media', interval: '15 min', message: '📱 Follow me on Twitter and Instagram! @YourHandle' },
            { name: 'Discord', interval: '20 min', message: '💬 Join our Discord community: discord.gg/example' },
            { name: 'Hydrate', interval: '30 min', message: '💧 Reminder: Stay hydrated! Drink some water!' },
            { name: 'Rules', interval: '25 min', message: '📜 Be respectful in chat! No spam or self-promo.' },
          ].map((timer) => (
            <div key={timer.name} className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-white">{timer.name}</span>
                <span className="text-[#53fc18] text-sm">{timer.interval}</span>
              </div>
              <p className="text-gray-400 text-sm">{timer.message}</p>
            </div>
          ))}
        </div>
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
      
      <p className="text-gray-300 mb-6">
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
        <p className="text-gray-300 mb-4">
          Each alert can have:
        </p>
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
        <p className="text-gray-300 mb-4">
          Create different alerts based on amounts. For example, gift subs:
        </p>
        <div className="space-y-2">
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-3">
            <span className="text-[#53fc18]">1-4 gifts:</span>
            <span className="text-gray-300 ml-2">Standard celebration</span>
          </div>
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-3">
            <span className="text-[#53fc18]">5-9 gifts:</span>
            <span className="text-gray-300 ml-2">Bigger animation + special sound</span>
          </div>
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded p-3">
            <span className="text-[#53fc18]">10+ gifts:</span>
            <span className="text-gray-300 ml-2">Epic full-screen animation</span>
          </div>
        </div>
      </SubSection>

      <SubSection title="Custom Styling">
        <p className="text-gray-300 mb-4">
          Each alert supports custom styling options:
        </p>
        <Table
          headers={['Option', 'Description']}
          rows={[
            ['Layout', 'Above, below, or beside the image'],
            ['Animation', 'Fade, slide, bounce, zoom effects'],
            ['Font Family', 'Custom fonts for text'],
            ['Font Size', 'Text size in pixels'],
            ['Text Color', 'Color of alert text'],
            ['Highlight Color', 'Color for usernames/amounts'],
            ['Background', 'Optional background color'],
            ['Volume', 'Sound volume (0-100)'],
          ]}
        />
      </SubSection>

      <SubSection title="Custom Code">
        <p className="text-gray-300 mb-4">
          Advanced users can add custom HTML, CSS, and JavaScript for fully custom alerts:
        </p>
        <CodeBlock>{`<!-- Custom HTML -->
<div class="my-custom-alert">
  <img src="{{image}}" />
  <p>{{message}}</p>
</div>

/* Custom CSS */
.my-custom-alert {
  animation: customBounce 0.5s ease;
}

// Custom JavaScript
console.log('Alert triggered:', alertData);`}</CodeBlock>
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
      
      <p className="text-gray-300 mb-6">
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
        <div className="space-y-4">
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
            <p className="text-[#53fc18] font-semibold mb-2">Follow Event</p>
            <CodeBlock>Welcome to the squad, $(user)! 🎉 Thanks for the follow!</CodeBlock>
          </div>
          
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
            <p className="text-[#53fc18] font-semibold mb-2">Subscribe Event</p>
            <CodeBlock>🌟 $(user) just subscribed for $(months) months! Thank you so much!</CodeBlock>
          </div>
          
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
            <p className="text-[#53fc18] font-semibold mb-2">Gift Sub Event</p>
            <CodeBlock>💝 $(user) is gifting $(amount) subs! You're amazing!</CodeBlock>
          </div>
          
          <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
            <p className="text-[#53fc18] font-semibold mb-2">Raid Event</p>
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
      
      <p className="text-gray-300 mb-6">
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

      <SubSection title="Manual Adjustments">
        <p className="text-gray-300 mb-4">
          Moderators and the broadcaster can manually adjust points:
        </p>
        <Table
          headers={['Action', 'Example']}
          rows={[
            ['Add points', 'Give winner 1000 points from dashboard'],
            ['Remove points', 'Deduct for rule violations'],
            ['Set exact amount', 'Reset someone to specific value'],
          ]}
        />
      </SubSection>

      <SubSection title="Leaderboard">
        <p className="text-gray-300 mb-4">
          The leaderboard shows your most engaged viewers:
        </p>
        <div className="bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
          <p className="text-gray-400 mb-2">Example <InlineCode>!leaderboard</InlineCode> output:</p>
          <div className="font-mono text-sm space-y-1">
            <p className="text-yellow-400">🥇 SuperFan - 15,250 points</p>
            <p className="text-gray-300">🥈 LoyalViewer - 12,100 points</p>
            <p className="text-orange-400">🥉 DailyWatcher - 9,850 points</p>
            <p className="text-gray-400">4. ChatActive - 7,200 points</p>
            <p className="text-gray-400">5. NewFriend - 5,100 points</p>
          </div>
        </div>
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
      
      <p className="text-gray-300 mb-6">
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
        <p className="text-gray-300 mb-4">
          Choose what happens when a filter is triggered:
        </p>
        <Table
          headers={['Action', 'Description']}
          rows={[
            ['Delete', 'Silently remove the message'],
            ['Timeout', 'Timeout user (configurable duration)'],
            ['Ban', 'Permanently ban the user'],
          ]}
        />
      </SubSection>

      <SubSection title="Link Filter">
        <p className="text-gray-300 mb-4">Configuration options:</p>
        <Table
          headers={['Setting', 'Description']}
          rows={[
            ['Enabled', 'Turn link filter on/off'],
            ['Action', 'What to do (delete/timeout/ban)'],
            ['Timeout Duration', 'Seconds to timeout (if action is timeout)'],
            ['Whitelist', 'Allowed domains (youtube.com, clips.kick.com)'],
            ['Permit Level', 'Users who can always post links'],
          ]}
        />
        
        <div className="mt-4">
          <p className="text-gray-400 mb-2">Example whitelist:</p>
          <CodeBlock>{`youtube.com
clips.kick.com
twitter.com
discord.gg`}</CodeBlock>
        </div>
      </SubSection>

      <SubSection title="Caps Filter">
        <p className="text-gray-300 mb-4">
          Prevents excessive caps usage:
        </p>
        <Table
          headers={['Setting', 'Description', 'Default']}
          rows={[
            ['Threshold', 'Percentage of caps to trigger', '70%'],
            ['Min Length', 'Minimum message length to check', '10 characters'],
          ]}
        />
      </SubSection>

      <SubSection title="Banned Words">
        <p className="text-gray-300 mb-4">
          Create a custom list of blocked words and phrases:
        </p>
        <Table
          headers={['Type', 'Description', 'Example']}
          rows={[
            ['Exact Match', 'Blocks the exact word', 'badword'],
            ['Regex Pattern', 'Pattern matching', 'b+a+d+ (matches baaad, bbbad)'],
          ]}
        />
        
        <Warning>
          Be careful with short words as exact matches - they might match parts of innocent words!
        </Warning>
      </SubSection>

      <SubSection title="Exempt Levels">
        <p className="text-gray-300 mb-4">
          Each filter can exempt certain user levels. Users at or above the exempt level bypass the filter:
        </p>
        <Table
          headers={['Level', 'Who\'s Exempt']}
          rows={[
            ['subscriber', 'Subs, VIPs, Mods, Broadcaster'],
            ['vip', 'VIPs, Mods, Broadcaster'],
            ['moderator', 'Mods, Broadcaster'],
            ['broadcaster', 'Only the streamer'],
          ]}
        />
      </SubSection>

      <SubSection title="Permit System">
        <p className="text-gray-300 mb-4">
          Temporarily allow users to bypass filters:
        </p>
        <CodeBlock>!permit @username 60</CodeBlock>
        <p className="text-gray-400 mt-2">
          This gives the user 60 seconds to post links without being filtered.
        </p>
      </SubSection>
    </div>
  );
}

function DiscordSection() {
  return (
    <div>
      <SectionTitle>Discord Integration</SectionTitle>
      
      <p className="text-gray-300 mb-6">
        Send automatic notifications to your Discord server when you go live or end your stream.
      </p>

      <SubSection title="Setting Up">
        <ol className="list-decimal list-inside space-y-3 text-gray-300">
          <li>Create a webhook in your Discord server (Server Settings → Integrations → Webhooks)</li>
          <li>Copy the webhook URL</li>
          <li>Paste it in the Discord settings page</li>
          <li>Enable the notifications you want</li>
        </ol>
      </SubSection>

      <SubSection title="Go-Live Notifications">
        <p className="text-gray-300 mb-4">
          When your stream goes live, the bot sends a rich embed to Discord:
        </p>
        <div className="bg-[#2f3136] border-l-4 border-[#53fc18] rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-[#53fc18] rounded-full"></div>
            <span className="font-bold text-white">KaoticKarmaTV is LIVE!</span>
          </div>
          <p className="text-white font-semibold mb-1">Playing: Just Chatting</p>
          <p className="text-gray-400 text-sm mb-3">Come hang out with the squad!</p>
          <div className="bg-[#1f1f23] rounded h-32 flex items-center justify-center text-gray-500">
            [Stream Screenshot]
          </div>
          <p className="text-gray-500 text-xs mt-2">kick.com/KaoticKarmaTV</p>
        </div>
      </SubSection>

      <SubSection title="Stream End Notifications">
        <p className="text-gray-300 mb-4">
          When your stream ends, send a summary with stats:
        </p>
        <div className="bg-[#2f3136] border-l-4 border-gray-500 rounded p-4">
          <p className="font-bold text-white mb-2">Stream Ended</p>
          <div className="text-gray-300 text-sm space-y-1">
            <p>⏱️ Duration: 3h 45m</p>
            <p>👥 Peak Viewers: 127</p>
            <p>💬 Chat Messages: 1,542</p>
            <p>➕ New Followers: 23</p>
          </div>
        </div>
      </SubSection>

      <SubSection title="Customization">
        <Table
          headers={['Setting', 'Description']}
          rows={[
            ['Webhook URL', 'Your Discord webhook URL'],
            ['Go-Live Enabled', 'Send notification when going live'],
            ['Go-Live Message', 'Custom message text'],
            ['Include Screenshot', 'Attach stream preview image'],
            ['Stream End Enabled', 'Send notification when stream ends'],
            ['Include Stats', 'Add stream statistics to end message'],
          ]}
        />
      </SubSection>

      <Tip>
        Use @everyone or role mentions in your go-live message to notify your Discord members!
      </Tip>
    </div>
  );
}

function OBSSection() {
  return (
    <div>
      <SectionTitle>OBS Setup</SectionTitle>
      
      <p className="text-gray-300 mb-6">
        Set up browser sources in OBS to display alerts on your stream.
      </p>

      <SubSection title="Adding the Alert Overlay">
        <ol className="list-decimal list-inside space-y-3 text-gray-300">
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
        <p className="text-gray-300 mb-4">
          Your unique overlay URL looks like:
        </p>
        <CodeBlock>http://localhost:3000/overlay/alerts?token=YOUR_UNIQUE_TOKEN</CodeBlock>
        <p className="text-gray-400 mt-2">
          Find this URL in your Alerts settings page. Keep your token private!
        </p>
      </SubSection>

      <SubSection title="Recommended Settings">
        <Table
          headers={['Setting', 'Value', 'Notes']}
          rows={[
            ['Width', '1920', 'Match your canvas width'],
            ['Height', '1080', 'Match your canvas height'],
            ['FPS', '60', 'Smooth animations'],
            ['Custom CSS', '(leave empty)', 'Styling is handled by the overlay'],
            ['Shutdown source when not visible', 'Unchecked', 'Keeps connection active'],
            ['Refresh when scene becomes active', 'Checked', 'Reconnects if disconnected'],
          ]}
        />
      </SubSection>

      <SubSection title="Positioning Alerts">
        <p className="text-gray-300 mb-4">
          After adding the browser source:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Right-click the source → Transform → Edit Transform</li>
          <li>Set Position to center your alerts where you want them</li>
          <li>Or resize/drag the source directly on the preview</li>
        </ol>
        
        <div className="mt-4 bg-[#1f1f23] border border-[#2f2f35] rounded-lg p-4">
          <p className="text-gray-400 mb-2">Common placements:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-1">
            <li><strong>Top Center</strong> - Above your webcam/content</li>
            <li><strong>Center</strong> - Full-screen attention</li>
            <li><strong>Bottom</strong> - Below main content area</li>
          </ul>
        </div>
      </SubSection>

      <SubSection title="Testing">
        <p className="text-gray-300 mb-4">
          To test your setup:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Go to the Alerts page in your dashboard</li>
          <li>Click "Test Alert" on any alert type</li>
          <li>Enter a test amount (for tiered alerts)</li>
          <li>Watch your OBS preview for the alert</li>
        </ol>
      </SubSection>

      <SubSection title="Troubleshooting">
        <Table
          headers={['Problem', 'Solution']}
          rows={[
            ['Alerts not showing', 'Check the URL is correct and bot is running'],
            ['No sound', 'Enable "Control audio via OBS" in browser source'],
            ['Choppy animations', 'Increase browser source FPS to 60'],
            ['Alert stuck', 'Refresh the browser source (right-click → Refresh)'],
            ['Wrong size', 'Match width/height to your canvas resolution'],
          ]}
        />
      </SubSection>

      <Warning>
        Never share your overlay URL publicly! It contains a unique token that identifies your account.
      </Warning>
    </div>
  );
}
