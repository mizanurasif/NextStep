import activity from "@/assets/icons/activity.png";
import add from "@/assets/icons/add.png";
import adobe from "@/assets/icons/adobe.png";
import back from "@/assets/icons/back.png";
import canva from "@/assets/icons/canva.png";
import claude from "@/assets/icons/claude.png";
import dropbox from "@/assets/icons/dropbox.png";
import figma from "@/assets/icons/figma.png";
import github from "@/assets/icons/github.png";
import home from "@/assets/icons/home.png";
import medium from "@/assets/icons/medium.png";
import menu from "@/assets/icons/menu.png";
import notion from "@/assets/icons/notion.png";
import openai from "@/assets/icons/openai.png";
import plus from "@/assets/icons/plus.png";
import setting from "@/assets/icons/setting.png";
import spotify from "@/assets/icons/spotify.png";
import wallet from "@/assets/icons/wallet.png";
import bell from "@/assets/icons/bell.png";
import briefcase from "@/assets/icons/briefcase.png";
import calendar from "@/assets/icons/calendar.png";
import clock from "@/assets/icons/clock.png";
import link from "@/assets/icons/link.png";
import mail from "@/assets/icons/mail.png";
import profile from "@/assets/icons/profile.png";
import search from "@/assets/icons/search.png";
import university from "@/assets/icons/university.png";

export const icons = {
    home,
    wallet,
    setting,
    activity,
    add,
    back,
    menu,
    plus,
    notion,
    dropbox,
    openai,
    adobe,
    medium,
    figma,
    spotify,
    github,
    claude,
    canva,
    bell,
    briefcase,
    calendar,
    clock,
    link,
    mail,
    profile,
    search,
    university,
} as const;

export type IconKey = keyof typeof icons;