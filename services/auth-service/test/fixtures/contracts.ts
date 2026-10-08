import { readFileSync } from 'fs';
import { join } from 'path';

// Event contracts shared by every service live in <repo>/contracts/events.
export function loadContract(name: string) {
    const file = join(__dirname, '..', '..', '..', '..', 'contracts', 'events', `${name}.json`);
    return JSON.parse(readFileSync(file, 'utf8'));
}
