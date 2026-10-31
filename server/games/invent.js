import { ClassicGame } from './classic.js';

/**
 * Mode 4 – « Invente » : on invente un titre drôle pour chaque miniature.
 * Même mécanique que le petit bac, mais le vrai titre n'est jamais montré
 * et les notes servent à désigner le plus drôle.
 */
export class InventGame extends ClassicGame {
  constructor(lobby) {
    super(lobby);
    this.mode = 'invent';
    this.clipSec = 0;
  }
}
