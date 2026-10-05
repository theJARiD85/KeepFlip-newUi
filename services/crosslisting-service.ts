import type { ListingPlatform } from '@/services/listingService';

export type CrosslistingMarketplace =
  | 'depop'
  | 'poshmark'
  | 'facebookMarketplace'
  | 'mercari'
  | 'offerUp';

export type CrosslistingPayload = {
  version: 1;
  marketplace: CrosslistingMarketplace;
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  brand: string;
  size: string;
  color: string;
  photoCount: number;
};

export type CrosslistingPayloadInput = Omit<CrosslistingPayload, 'version'>;

export const CROSSLISTING_DESTINATIONS: Record<
  CrosslistingMarketplace,
  { label: string; loginUrl: string; createUrl: string; origin: string }
> = {
  depop: {
    label: 'Depop',
    loginUrl: 'https://www.depop.com/login/',
    createUrl: 'https://www.depop.com/sell/',
    origin: 'https://www.depop.com',
  },
  poshmark: {
    label: 'Poshmark',
    loginUrl: 'https://poshmark.com/login',
    createUrl: 'https://poshmark.com/sell',
    origin: 'https://poshmark.com',
  },
  facebookMarketplace: {
    label: 'Facebook Marketplace',
    loginUrl: 'https://www.facebook.com/login/',
    createUrl: 'https://www.facebook.com/marketplace/create/item',
    origin: 'https://www.facebook.com',
  },
  mercari: {
    label: 'Mercari',
    loginUrl: 'https://www.mercari.com/login/',
    createUrl: 'https://www.mercari.com/sell/',
    origin: 'https://www.mercari.com',
  },
  offerUp: {
    label: 'OfferUp',
    loginUrl: 'https://offerup.com/',
    createUrl: 'https://offerup.com/',
    origin: 'https://offerup.com',
  },
};

export function getCrosslistingMarketplace(
  platform: ListingPlatform,
): CrosslistingMarketplace | null {
  return platform === 'depop' ||
    platform === 'poshmark' ||
    platform === 'facebookMarketplace' ||
    platform === 'mercari' ||
    platform === 'offerUp'
    ? platform
    : null;
}

export function createCrosslistingPayload(
  input: CrosslistingPayloadInput,
): CrosslistingPayload {
  return {
    version: 1,
    marketplace: input.marketplace,
    title: input.title.trim(),
    description: input.description.trim(),
    price: input.price.trim(),
    category: input.category.trim(),
    condition: input.condition.trim(),
    brand: input.brand.trim(),
    size: input.size.trim(),
    color: input.color.trim(),
    photoCount: Number.isFinite(input.photoCount)
      ? Math.max(0, Math.floor(input.photoCount))
      : 0,
  };
}

// Shared between the Android WebView bridge and the bookmarklet so both flows
// target the same controls and dispatch the same controlled-input events.
const FILLER_SOURCE = [
  'function(p,done){',
  'var hosts={depop:"depop.com",poshmark:"poshmark.com",facebookMarketplace:"facebook.com",mercari:"mercari.com",offerUp:"offerup.com"},host=location.hostname.toLowerCase(),allowed=hosts[p&&p.marketplace];',
  'if(!p||p.version!==1||!allowed||!(host===allowed||host.endsWith("."+allowed))){if(done)done({filled:0,error:"wrong_marketplace"});return}',
  'var common={',
  'title:["input[data-qa-id*=title i]","input[name*=title i]","input[placeholder*=title i]","input[aria-label*=title i]","input[id*=title i]","input[data-testid*=title i]","input[data-test*=title i]","input","textarea","[role=textbox]","[contenteditable=true]"],',
  'description:["textarea[data-qa-id*=description i]","textarea[name*=description i]","textarea[placeholder*=description i]","textarea[aria-label*=description i]","textarea[id*=description i]","textarea[data-testid*=description i]","[contenteditable=true][aria-label*=description i]","[role=textbox][aria-label*=description i]","input","textarea","[role=textbox]","[contenteditable=true]"],',
  'price:["input[data-qa-id*=price i]","input[name*=price i]","input[placeholder*=price i]","input[aria-label*=price i]","input[id*=price i]","input[data-testid*=price i]","input[data-test*=price i]","input","textarea","[role=textbox]"],',
  'category:["input[name*=category i]","input[placeholder*=category i]","input[aria-label*=category i]","select[name*=category i]","input","select","[role=combobox]"],',
  'condition:["input[name*=condition i]","input[placeholder*=condition i]","input[aria-label*=condition i]","select[name*=condition i]","input","select","[role=combobox]"],',
  'brand:["input[name*=brand i]","input[placeholder*=brand i]","input[aria-label*=brand i]","input","[role=combobox]"],',
  'size:["input[name*=size i]","input[placeholder*=size i]","input[aria-label*=size i]","select[name*=size i]","input","select","[role=combobox]"],',
  'color:["input[name*=color i]","input[placeholder*=color i]","input[aria-label*=color i]","input","[role=combobox]"]};',
  'var fields=Object.assign({},common);',
  'if(p.marketplace==="poshmark"){fields.title=["input[data-qa-id=listing-title-input]"].concat(common.title);fields.description=["textarea[data-qa-id=listing-description-input]"].concat(common.description);fields.price=["input[data-qa-id=listing-price-input]","input[name*=listingPrice i]","input[name*=listing_price i]","input[placeholder*=listing price i]","input[aria-label*=listing price i]","input[data-testid*=listing-price i]","input[data-test*=listing-price i]"].concat(common.price)}',
  'var values={title:p.title,description:p.description,price:p.price,category:p.category,condition:p.condition,brand:p.brand,size:p.size,color:p.color},filled={};',
  'var normalize=function(s){return String(s||"").trim().toLowerCase().replace(/\\s+/g," ")};',
  'var find=function(key){var selectors=fields[key]||[],seen=new Set(),matches=[];for(var i=0;i<selectors.length;i++){document.querySelectorAll(selectors[i]).forEach(function(el){if(!seen.has(el)){seen.add(el);matches.push(el)}})}var patterns={title:/title|item name|name your (listing|item)|product name|listing name/i,description:/description|describe your item|item details/i,price:/price/i,category:/category/i,condition:/condition/i,brand:/brand/i,size:/size/i,color:/color/i},pattern=patterns[key];for(var j=0;j<matches.length;j++){var el=matches[j],labels=el.labels?Array.from(el.labels).map(function(l){return l.textContent||""}).join(" "):"",labelledBy=(el.getAttribute("aria-labelledby")||"").split(/\\s+/).map(function(id){var node=document.getElementById(id);return node?node.textContent||"":""}).join(" "),label=[el.name,el.id,el.getAttribute("placeholder"),el.getAttribute("aria-label"),el.getAttribute("data-testid"),el.getAttribute("data-test"),el.getAttribute("data-qa-id"),labelledBy,labels,el.closest("label")&&el.closest("label").textContent].join(" ");if(!pattern.test(label))continue;if(!(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT"||el.isContentEditable))continue;if(key==="price"&&p.marketplace==="poshmark"&&/original|retail|msrp/i.test(label))continue;if(el.disabled||el.readOnly||el.type==="hidden"||el.type==="password"||el.type==="checkbox"||el.type==="radio"||el.type==="file"||el.type==="button"||el.type==="submit"||el.type==="reset")continue;return el}return null};',
  'var set=function(key,value){if(typeof value!=="string"||!value.trim()||filled[key])return;var el=find(key);if(!el)return;var isSelect=el instanceof HTMLSelectElement,old=String(isSelect?el.value:(el.value||el.textContent||"")).trim();if(!isSelect&&old&&old!==value)return;if(isSelect){if(old&&normalize(old)!==normalize(value))return;var wanted=normalize(value),match=null;for(var i=0;i<el.options.length;i++){var option=el.options[i];if(normalize(option.value)===wanted||normalize(option.textContent)===wanted){match=option;break}}if(!match)return;value=match.value}',
  'var next=el.maxLength>0?value.slice(0,el.maxLength):value;if(el.isContentEditable){el.textContent=next}else{var proto=Object.getPrototypeOf(el),setter=Object.getOwnPropertyDescriptor(proto,"value");if(setter&&setter.set)setter.set.call(el,next);else el.value=next}el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));el.blur();filled[key]=true};',
  'var tries=0,timer=setInterval(function(){Object.keys(values).forEach(function(key){set(key,values[key])});tries++;if(tries>=30||Object.keys(filled).length===Object.keys(values).length){clearInterval(timer);if(done)done({filled:Object.keys(filled).length,fields:Object.keys(filled),photoCount:p.photoCount||0})}},500);',
  'Object.keys(values).forEach(function(key){set(key,values[key])})',
  '}',
].join('');

function escapeForInlineScript(value: string) {
  return value
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildWebViewAutofillScript(payload: CrosslistingPayload) {
  const serializedPayload = escapeForInlineScript(JSON.stringify(payload));
  return `(${FILLER_SOURCE})(${serializedPayload},function(result){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({kind:"keepflip-crosslisting-result",filled:result.filled,fields:result.fields||[],error:result.error||null,photoCount:result.photoCount||0}))}});true;`;
}

// The bookmarklet wrapper is a compact javascript: URL. It reads only the
// versioned KeepFlip payload and never submits the marketplace form.
export const CROSSLISTING_BOOKMARKLET =
  `javascript:(()=>{try{if(!navigator.clipboard||!navigator.clipboard.readText)throw 0;navigator.clipboard.readText().then(function(text){var payload=JSON.parse(text);(${FILLER_SOURCE})(payload,function(result){if(result.error){alert("Open the matching Facebook Marketplace, OfferUp, Depop, Mercari, or Poshmark listing page, then run KeepFlip Autofill again.");return}if(!result.filled){alert("KeepFlip did not find supported listing fields on this page. Open the listing form and try again.");return}alert("KeepFlip filled "+result.filled+" fields. Add the "+(result.photoCount||0)+" item photos, review the listing, and post it when ready.")})}).catch(function(){alert("KeepFlip could not read listing data from your clipboard. Copy the listing from KeepFlip and try again.")})}catch(e){alert("KeepFlip could not read listing data from your clipboard. Copy the listing from KeepFlip and try again.")}})();`;
