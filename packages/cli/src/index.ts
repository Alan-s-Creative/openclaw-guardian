#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program
  .name('guardian')
  .description('OpenClaw Guardian — config monitor & recovery')
  .version('0.1.0');

// TODO: register commands in ALA-413
program.parse();
