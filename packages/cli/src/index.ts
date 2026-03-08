#!/usr/bin/env node
import { Command } from 'commander'
import { watchCmd } from './commands/watch.js'
import { statusCmd } from './commands/status.js'
import { historyCmd } from './commands/history.js'
import { restoreCmd } from './commands/restore.js'
import { fixCmd } from './commands/fix.js'
import { upgradeCmd } from './commands/upgrade.js'
import { versionsCmd } from './commands/versions.js'
import { rollbackCmd } from './commands/rollback.js'

const program = new Command()
program
  .name('guardian')
  .description('OpenClaw Guardian — config monitor & recovery')
  .version('0.1.0')

program.addCommand(watchCmd())
program.addCommand(statusCmd())
program.addCommand(historyCmd())
program.addCommand(restoreCmd())
program.addCommand(fixCmd())
program.addCommand(upgradeCmd())
program.addCommand(versionsCmd())
program.addCommand(rollbackCmd())

program.parse()
