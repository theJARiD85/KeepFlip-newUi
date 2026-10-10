import type { InventoryItem } from '@/services/inventory-service';
import type { ListingGeneratorResult, ListingPlatform } from '@/services/listingService';

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
  platformFields: Record<string, string>;
};

export type CrosslistingPayloadInput = Omit<
  CrosslistingPayload,
  'version' | 'platformFields'
> & { platformFields?: Record<string, string> };

export type CrosslistingField =
  | 'title'
  | 'description'
  | 'price'
  | 'category'
  | 'condition'
  | 'brand'
  | 'size'
  | 'color'
  | 'photoInput';

export type CrosslistingFormSelectors = Record<string, string[]>;

export type CrosslistingPhotoAsset = {
  name: string;
  dataUrl: string;
};

export const CROSSLISTING_DESTINATIONS: Record<
  CrosslistingMarketplace,
  { label: string; loginUrl: string; createUrl: string; origin: string }
> = {
  depop: {
    label: 'Depop',
    loginUrl: 'https://www.depop.com/login/',
    createUrl: 'https://www.depop.com/products/create/',
    origin: 'https://www.depop.com',
  },
  poshmark: {
    label: 'Poshmark',
    loginUrl: 'https://poshmark.com/login',
    createUrl: 'https://poshmark.com/create-listing',
    origin: 'https://poshmark.com',
  },
  facebookMarketplace: {
    label: 'Facebook Marketplace',
    loginUrl: 'https://www.facebook.com/login/',
    createUrl: 'https://www.facebook.com/marketplace/create/',
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
    loginUrl: 'https://offerup.com/login',
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
  const platformFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.platformFields ?? {})) {
    const cleanKey = key.trim();
    const cleanValue = typeof value === 'string' ? value.trim() : '';
    if (
      /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(cleanKey) &&
      cleanValue &&
      cleanValue.length <= 1000
    ) {
      platformFields[cleanKey] = cleanValue;
    }
  }
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
    platformFields,
  };
}

export function createGeneratedCrosslistingPayload({
  marketplace,
  listing,
  item,
}: {
  marketplace: CrosslistingMarketplace;
  listing: ListingGeneratorResult['listing'];
  item: InventoryItem;
}): CrosslistingPayload {
  const draft = listing.marketplaceListings[marketplace];
  const rawFields = draft.fields as Record<string, unknown>;
  const platformFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (typeof value === 'string' && value.trim()) platformFields[key] = value.trim();
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      platformFields[key] = String(value);
    }
  }

  if (marketplace === 'facebookMarketplace') {
    const detailEntries: [string, string | null | undefined][] = [
      ...Object.entries(item.itemSpecifics ?? {}),
      ['brand', item.brand],
      ['model', item.model],
      ['size', item.itemSpecifics?.size ?? item.variant],
      ['color', item.color],
      ['era', item.era],
      ['serialNumber', item.serialNumber],
      ['sku', item.sku],
    ];
    for (const [rawKey, rawValue] of detailEntries) {
      const words = rawKey.trim().replace(/([a-z0-9])([A-Z])/g, '$1 $2').match(/[A-Za-z0-9]+/g) ?? [];
      const [firstWord, ...remainingWords] = words;
      const key = firstWord
        ? firstWord.toLowerCase() + remainingWords.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')
        : '';
      const value = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!key || !value || key.length > 64 || Object.prototype.hasOwnProperty.call(platformFields, key) ||
        Object.keys(platformFields).length >= 30) continue;
      platformFields[key] = value;
    }
  }

  const conditionDisclosure = listing.conditionDisclosure.trim();
  const description = draft.description.trim();
  return createCrosslistingPayload({
    marketplace,
    title: draft.title || listing.title,
    description: conditionDisclosure && !description.includes(conditionDisclosure)
      ? `${description}\n\nCondition: ${conditionDisclosure}`
      : description,
    price: Number.isFinite(listing.priceRange.targetPrice)
      ? listing.priceRange.targetPrice.toFixed(2)
      : '',
    category: platformFields.category ?? item.category ?? '',
    condition: platformFields.condition ?? item.condition?.replaceAll('_', ' ') ?? '',
    brand: platformFields.brand ?? item.brand ?? '',
    size: platformFields.size ?? item.itemSpecifics?.size ?? item.variant ?? '',
    color: platformFields.color ?? item.color ?? '',
    photoCount: item.itemPhotos.length || item.photoCount,
    platformFields,
  });
}

// Shared between the native WebView bridge and the bookmarklet so both flows
// target the same controls and dispatch the same controlled-input events.
const FILLER_SOURCE = [
  'function(p,selectorOverrides,photos,done){',
  'var hosts={depop:"depop.com",poshmark:"poshmark.com",facebookMarketplace:"facebook.com",mercari:"mercari.com",offerUp:"offerup.com"},host=location.hostname.toLowerCase(),allowed=hosts[p&&p.marketplace];',
  'if(!p||p.version!==1||!allowed||location.protocol!=="https:"||!(host===allowed||host.endsWith("."+allowed))){if(done)done({filled:0,error:"wrong_marketplace"});return}',
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
  'Object.keys(selectorOverrides||{}).forEach(function(key){var custom=selectorOverrides[key];if(Array.isArray(custom)&&custom.length)fields[key]=custom.concat(fields[key]||[])});',
  'var values={title:p.title,description:p.description,price:p.price,category:p.category,condition:p.condition,brand:p.brand,size:p.size,color:p.color},filled={};',
  'Object.keys(p.platformFields||{}).forEach(function(key){if(!Object.prototype.hasOwnProperty.call(values,key)&&typeof p.platformFields[key]==="string")values[key]=p.platformFields[key]});',
  'Object.keys(values).forEach(function(key){if(!fields[key])fields[key]=["input","textarea","select","[role=combobox]","[contenteditable=true]"]});',
  'var normalize=function(s){return String(s||"").trim().toLowerCase().replace(/\\s+/g," ")};',
  'var find=function(key){var selectors=fields[key]||[],seen=new Set(),matches=[];for(var i=0;i<selectors.length;i++){try{document.querySelectorAll(selectors[i]).forEach(function(el){if(!seen.has(el)){seen.add(el);matches.push(el)}})}catch(e){}}var patterns={title:/title|item name|name your (listing|item)|product name|listing name/i,description:/description|describe your item|item details/i,price:/price/i,category:/category/i,condition:/condition/i,brand:/brand/i,size:/size/i,color:/color/i},labelKey=String(key).replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]+/g," "),pattern=patterns[key]||new RegExp(labelKey,"i");for(var j=0;j<matches.length;j++){var el=matches[j],labels=el.labels?Array.from(el.labels).map(function(l){return l.textContent||""}).join(" "):"",labelledBy=(el.getAttribute("aria-labelledby")||"").split(/\\s+/).map(function(id){var node=document.getElementById(id);return node?node.textContent||"":""}).join(" "),label=[el.name,el.id,el.getAttribute("placeholder"),el.getAttribute("aria-label"),el.getAttribute("data-testid"),el.getAttribute("data-test"),el.getAttribute("data-qa-id"),labelledBy,labels,el.closest("label")&&el.closest("label").textContent].join(" ");if(!pattern.test(label))continue;if(!(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT"||el.isContentEditable))continue;if(key==="price"&&p.marketplace==="poshmark"&&/original|retail|msrp/i.test(label))continue;if(el.disabled||el.readOnly||el.type==="hidden"||el.type==="password"||el.type==="checkbox"||el.type==="radio"||el.type==="file"||el.type==="button"||el.type==="submit"||el.type==="reset")continue;return el}return null};',
  'var set=function(key,value){if(typeof value!=="string"||!value.trim()||filled[key])return;var el=find(key);if(!el)return;var isSelect=el instanceof HTMLSelectElement,old=String(isSelect?el.value:(el.value||el.textContent||"")).trim();if(!isSelect&&old&&old!==value)return;if(isSelect){if(old&&normalize(old)!==normalize(value))return;var wanted=normalize(value),match=null;for(var i=0;i<el.options.length;i++){var option=el.options[i];if(normalize(option.value)===wanted||normalize(option.textContent)===wanted){match=option;break}}if(!match)return;value=match.value}',
  'var next=el.maxLength>0?value.slice(0,el.maxLength):value;if(el.isContentEditable){el.textContent=next}else{var proto=Object.getPrototypeOf(el),setter=Object.getOwnPropertyDescriptor(proto,"value");if(setter&&setter.set)setter.set.call(el,next);else el.value=next}el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));el.blur();filled[key]=true};',
  'var photoState={complete:!photos||!photos.length,pending:false,uploaded:0,error:null};',
  'var uploadPhotos=function(){if(photoState.complete||photoState.pending||!photos||!photos.length)return;var selectors=selectorOverrides&&selectorOverrides.photoInput||["input[type=file][accept*=image i]","input[type=file]"];var input=null;for(var i=0;i<selectors.length&&!input;i++){try{input=document.querySelector(selectors[i])}catch(e){}}if(!input)return;photoState.pending=true;if(typeof DataTransfer==="undefined"||typeof File==="undefined"){photoState.pending=false;photoState.complete=true;photoState.error="file_transfer_unavailable";return}var selected=photos.slice(0,input.multiple?8:1);Promise.all(selected.map(function(photo){return fetch(photo.dataUrl).then(function(response){if(!response.ok)throw new Error("photo_read_failed");return response.blob()}).then(function(blob){return new File([blob],photo.name||"keepflip-photo.jpg",{type:blob.type||"image/jpeg"})})})).then(function(files){var transfer=new DataTransfer();files.forEach(function(file){transfer.items.add(file)});input.files=transfer.files;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));photoState.uploaded=input.files?input.files.length:files.length;photoState.complete=true;photoState.pending=false}).catch(function(){photoState.error="photo_upload_rejected";photoState.complete=true;photoState.pending=false})};',
  'var required=Object.keys(values).filter(function(key){return typeof values[key]==="string"&&values[key].trim()});',
  'var finish=function(){if(done)done({filled:Object.keys(filled).length,fields:Object.keys(filled),missingFields:required.filter(function(key){return !filled[key]}),photoCount:p.photoCount||0,uploadedPhotoCount:photoState.uploaded,photoError:photoState.error})};',
  'var tries=0,timer=setInterval(function(){Object.keys(values).forEach(function(key){set(key,values[key])});uploadPhotos();tries++;var coreDone=["title","description","price"].filter(function(key){return values[key]}).every(function(key){return filled[key]});if((coreDone&&tries>=8&&!photoState.pending)||tries>=30){clearInterval(timer);if(photos&&photos.length&&!photoState.complete)photoState.error=photoState.pending?"photo_upload_timeout":"photo_input_not_found";finish()}},500);',
  'Object.keys(values).forEach(function(key){set(key,values[key])})',
  '}',
].join('');

function escapeForInlineScript(value: string) {
  return value
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildWebViewAutofillScript(
  payload: CrosslistingPayload,
  selectors: CrosslistingFormSelectors = {},
  photos: CrosslistingPhotoAsset[] = [],
  unavailablePhotoCount = 0,
  requestId = 0,
) {
  const serializedPayload = escapeForInlineScript(JSON.stringify(payload));
  const serializedSelectors = escapeForInlineScript(JSON.stringify(selectors));
  const serializedPhotos = escapeForInlineScript(JSON.stringify(photos));
  return `(${FILLER_SOURCE})(${serializedPayload},${serializedSelectors},${serializedPhotos},function(result){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({kind:"keepflip-crosslisting-result",requestId:${Math.max(0, Math.floor(requestId))},filled:result.filled,fields:result.fields||[],missingFields:result.missingFields||[],error:result.error||null,photoCount:result.photoCount||0,uploadedPhotoCount:result.uploadedPhotoCount||0,photoError:result.photoError||null,unavailablePhotoCount:${Math.max(0, Math.floor(unavailablePhotoCount))}}))}});true;`;
}

export function buildWebViewSubmitScript(
  marketplace: CrosslistingMarketplace,
  selectors: CrosslistingFormSelectors = {},
) {
  const hosts: Record<CrosslistingMarketplace, string> = {
    depop: 'depop.com',
    poshmark: 'poshmark.com',
    facebookMarketplace: 'facebook.com',
    mercari: 'mercari.com',
    offerUp: 'offerup.com',
  };
  const serializedMarketplace = escapeForInlineScript(JSON.stringify(marketplace));
  const serializedHost = escapeForInlineScript(JSON.stringify(hosts[marketplace]));
  const serializedSelectors = escapeForInlineScript(JSON.stringify(selectors));
  return `(function(){
    var allowed=${serializedHost},config=${serializedSelectors},host=location.hostname.toLowerCase();
    var send=function(status){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({kind:"keepflip-crosslisting-submit-result",marketplace:${serializedMarketplace},status:status}))};
    if(location.protocol!=="https:"||!(host===allowed||host.endsWith("."+allowed))){send("wrong_marketplace");return}
    var visible=function(button){var rect=button.getBoundingClientRect();return rect.width>0&&rect.height>0&&!button.disabled&&button.getAttribute("aria-disabled")!=="true"};
    var label=function(button){return (button.innerText||button.textContent||button.value||"").trim()};
    var candidates=[];
    (config.submitButton||[]).forEach(function(selector){try{document.querySelectorAll(selector).forEach(function(button){candidates.push(button)})}catch(e){}});
    var button=candidates.find(visible);
    var buttons=Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(visible);
    var inListingArea=function(candidate){return candidate.type==="submit"||Boolean(candidate.closest&&candidate.closest('main,form,dialog,[role="dialog"]'))};
    if(!button)button=buttons.find(function(candidate){return inListingArea(candidate)&&/^(post|publish|list|list item|create listing|submit listing)$/i.test(label(candidate))});
    if(button){button.click();send("clicked");return}
    var advance=buttons.find(function(candidate){return inListingArea(candidate)&&/^(next|continue|review)$/i.test(label(candidate))});
    if(advance){advance.click();send("next_clicked");return}
    send("submit_button_not_found");
  })();true;`;
}

// The bookmarklet wrapper is a compact javascript: URL. It reads only the
// versioned KeepFlip payload and never submits the marketplace form.
export const CROSSLISTING_BOOKMARKLET =
  `javascript:(()=>{try{if(!navigator.clipboard||!navigator.clipboard.readText)throw 0;navigator.clipboard.readText().then(function(text){var payload=JSON.parse(text);(${FILLER_SOURCE})(payload,{},[],function(result){if(result.error){alert("Open the matching Facebook Marketplace, OfferUp, Depop, Mercari, or Poshmark listing page, then run KeepFlip Autofill again.");return}if(!result.filled){alert("KeepFlip did not find supported listing fields on this page. Open the listing form and try again.");return}alert("KeepFlip filled "+result.filled+" fields. Add the "+(result.photoCount||0)+" item photos, review the listing, and post it when ready.")})}).catch(function(){alert("KeepFlip could not read listing data from your clipboard. Copy the listing from KeepFlip and try again.")})}catch(e){alert("KeepFlip could not read listing data from your clipboard. Copy the listing from KeepFlip and try again.")}})();`;
