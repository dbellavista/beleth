/**
 * @file protonmail.js
 * @module lib/protonmail
 * @author Daniele Bellavista
 * @version 0.0
 *
 */
'use strict';

const puppeteer = require('puppeteer');
const prompt = require('prompt');

/**
 * ProtonMail
 * @access public
 */
class ProtonMail {
  #user;
  #password;
  #twofa = false;

  #browser;
  #page;

  /**
   * @constructor
   * @param {string} user User
   * @param {string} password Password
   * @return {undefined}
   */
  constructor({ user, password, twofa }) {
    this.#user = user;
    this.#password = password;
    this.#twofa = twofa;
  }

  async _init() {
    if (!this.#browser) {
      this.#browser = await puppeteer.launch();
    }
    if (!this.#page) {
      this.#page = await this.#browser.newPage();
    }
  }

  async _perform2FA() {
    await this.#page.waitForSelector('#login_btn_2fa')

    prompt.start();
    const passcode = await new Promise((resolve, reject) => {
      prompt.get(['passcode'], (err, result) => err ? reject(err) : resolve(result.passcode));
    });
    await this.#page.type('#twoFactorCode', passcode)
    await this.#page.click('#login_btn_2fa')
  }

  async login() {
    await this._init();
    await this.#page.goto('https://mail.protonmail.com/login');
    await this.#page.waitForSelector('#login_btn')
    await this.#page.type('#username', this.#user)
    await this.#page.type('#password', this.#password)
    await this.#page.click('#login_btn')
    if (this.#twofa) {
      await this._perform2FA();
    }
    await this.#page.waitForSelector('#ptSidebar')
    await this.#page.screenshot({path: 'example.png'});

    await this.#browser.close();
  }
}

module.exports = {ProtonMail};
