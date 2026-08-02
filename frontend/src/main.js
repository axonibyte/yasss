import { mount } from 'svelte';
import './app.scss';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app') });
