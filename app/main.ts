import { mount } from 'svelte';
import '../ui/shell/design-system.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root element missing');

mount(App, { target });
