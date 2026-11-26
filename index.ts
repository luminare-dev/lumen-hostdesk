// Lumen hostdesk: a companion app for KeyHelp server admins, built by Luminare Development.
// Not affiliated with or endorsed by Keyweb AG; KeyHelp is a registered trademark of Keyweb AG.

import { registerRootComponent } from 'expo';

// Defines the background task in the global scope before anything else (expo-task-manager).
import './src/alerts/background';
import App from './App';

registerRootComponent(App);
