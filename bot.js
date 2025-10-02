// bot.js
// Simple AFK bot using mineflayer + pathfinder.
// Usage: node bot.js
// Configure with env vars or edit defaults below.

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const CONFIG = {
  host: process.env.MC_HOST || 'my-mc.link', // server IP
  port: parseInt(process.env.MC_PORT || '35247', 10),
  username: process.env.MC_USER || 'AkifBolt', // change if needed
  password: process.env.MC_PASS || undefined, // leave undefined for offline mode or set for online-mode servers
  offline: process.env.MC_OFFLINE ? process.env.MC_OFFLINE === 'true' : true,
  afkRadius: parseFloat(process.env.AFK_RADIUS || '6'), // how far to wander from spawn
  actionIntervalSec: parseFloat(process.env.AFK_INTERVAL || '18'), // how often to pick a new movement/action
  reconnectDelaySec: 8,
}

function createBot() {
  console.log(`Starting bot -> ${CONFIG.username}@${CONFIG.host}:${CONFIG.port} (offline:${CONFIG.offline})`)
  const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    password: CONFIG.password,
    offline: CONFIG.offline,
    keepAlive: true,
  })

  bot.loadPlugin(pathfinder)

  let homePos = null
  let mov = null

  bot.once('spawn', () => {
    console.log('Spawned. Setting home position and movements.')
    homePos = bot.entity.position.clone()
    mov = new Movements(bot, require('minecraft-data')(bot.version))
    bot.pathfinder.setMovements(mov)
    startActionLoop(bot)
  })

  bot.on('kicked', (reason) => {
    console.log('Kicked:', reason.toString())
  })

  bot.on('end', (reason) => {
    console.log('Disconnected:', reason)
    // reconnect after a delay
    setTimeout(createBot, CONFIG.reconnectDelaySec * 1000)
  })

  bot.on('error', (err) => {
    console.log('Error:', err.message)
  })

  // keep inventory interaction minimal to avoid triggering anti-cheat
  function startActionLoop(bot) {
    // pick a random action every actionIntervalSec
    setInterval(async () => {
      if (!bot.entity || !bot.entity.position) return
      try {
        const rnd = Math.random()
        if (rnd < 0.45) {
          // Walk to a random nearby point within radius
          const angle = Math.random() * Math.PI * 2
          const r = Math.random() * CONFIG.afkRadius
          const target = homePos.offset(Math.cos(angle) * r, 0, Math.sin(angle) * r)
          console.log('Walking to', target.floored())
          bot.pathfinder.setGoal(new GoalNear(target.x, target.y, target.z, 1))
        } else if (rnd < 0.7) {
          // Look around and rotate head slowly
          const yaw = Math.random() * Math.PI * 2 - Math.PI
          const pitch = (Math.random() * 40 - 20) * (Math.PI / 180)
          bot.look(yaw, pitch, true)
          console.log('Looking around (yaw,pitch):', yaw.toFixed(2), pitch.toFixed(2))
        } else if (rnd < 0.85) {
          // Jump a couple times (helps avoid AFK-kick in some setups)
          console.log('Jumping sequence')
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 400)
        } else {
          // Tiny strafe and sneak for a short moment
          console.log('Tiny strafe/sneak')
          const left = Math.random() < 0.5
          bot.setControlState(left ? 'left' : 'right', true)
          bot.setControlState('sneak', true)
          setTimeout(() => {
            bot.setControlState(left ? 'left' : 'right', false)
            bot.setControlState('sneak', false)
          }, 800 + Math.floor(Math.random() * 800))
        }

        // occasional small chat to appear active (disabled by default)
        // if (Math.random() < 0.03) bot.chat('/me nods (AFK bot)')
      } catch (e) {
        console.log('Action loop error:', e.message)
      }
    }, CONFIG.actionIntervalSec * 1000)
  }

  // optional safe idle handler - stop moving when unsafe block below, lava, void, etc.
  bot.on('physicTick', () => {
    if (!bot.entity) return
    const pos = bot.entity.position.offset(0, -1, 0)
    const block = bot.blockAt(pos)
    if (!block) return
    const name = block.name || ''
    // if standing over air or lava or cactus, try to move back to home
    if (name.includes('air') || name.includes('lava') || name.includes('cactus')) {
      console.log('Unsafe ground detected:', name, 'moving back to home.')
      bot.pathfinder.setGoal(new GoalNear(homePos.x, homePos.y, homePos.z, 1))
    }
  })

  return bot
}

createBot()
