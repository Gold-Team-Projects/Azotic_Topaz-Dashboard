var currentColumns = 0;
var currentRows = 0;
let overlayClose = () => {};
let currentWidgetCount = 0;
let data = {};
let workspace = {};
let path;
let endFunctions = [];
let highestID = 0;
const widgetParts =                 ["Name", "ID"];
const extraWidgetParts =            ["X", "Y", "Width", "Height"];
const extraWidgetPartsDefaults =    [() => 0, () => parseInt(currentRows), () => 1, () => 1];
const column = ' minmax(28%, 1fr)'
const row = ' minmax(28%, 1fr)';
const setSetting = (id, name, x) => workspace.widgets.find(x => x.wid == id).settings[name] = x;
const setData = (id, name, x) => workspace.widgets.find(x => x.wid == id).data[name] = x;
const has = (o, v) => Object.hasOwn(o, v); 
const tryTo = (x) => { try { x(); return true; } catch { return false; }}

function validateSettings(wid, s = null) {
    const settings = s == null ? workspace.widgets.find(x => x.wid == wid).settings : s;
    settings.x = parseInt(settings.x);
    settings.y = parseInt(settings.y);
    settings.width = parseInt(settings.width);
    settings.height = parseInt(settings.height);
}

const endfunc = async () => {
    window.api.log('Received "alert:end"');
    const setSetting = (id, name, x) => workspace.widgets.find(x => x.wid == id).settings[name] = x;
    const setData = (id, name, x) => workspace.widgets.find(x => x.wid == id).data[name] = x;
    endFunctions.forEach((x, i) => x({ 
        setSetting: (name, x) => setSetting(i, name, x), 
        setData: (name, x) => setData(i, name, x), 
        log: window.api.log 
    }));
    await window.api.fs.write(path, JSON.stringify(workspace));
    await window.api.fs.write('data.json', JSON.stringify(data));
    window.api.log('Finished (endfunc)');
    await window.api.respondToEnd();
}

/**
 * Sets up the app for execution.
 */
async function setUp() {
    const container = document.getElementById('container');
    //container.style.gridTemplateColumns = 'minmax(0, 1fr)';

    if (await window.api.fs.exists('data.json') != true) {
        window.api.fs.write('data.json', JSON.stringify({ workspaces: { default: { path: "workspaces/default.json" } }, latest: "default" }));
        window.api.fs.mkdir('workspaces');
        window.api.fs.write('workspaces/default.json', JSON.stringify({ name: "Default Workspace", widgets: [] }));
    }

    const decoder = new TextDecoder();
    data = JSON.parse(decoder.decode(await window.api.fs.read('data.json')));
    workspace = JSON.parse(decoder.decode(await window.api.fs.read(data.workspaces[data.latest].path)));
    path = data.workspaces[data.latest].path;

    workspace.widgets.forEach(async widget => {
        await loadWidget(container, widget.name, widget.id, structuredClone(widget.settings), widget.data, highestID);
        highestID++;
    });

    window.api.setEndFunc(endfunc);
}

async function openSettings(wid) {
    overlayClose();

    const overlay = document.createElement('div');
    overlay.className = "overlay";
    
    overlayClose = () => overlay.remove();

    const id = workspace.widgets.find(x => x.wid == wid).id;
    const widgetData = JSON.parse(await (await fetch(`../static/widgets/${id}/${id}.widget.json`)).text());

    Object.keys(widgetData.settings).map(x => [x, workspace.widgets.filter(x => x.wid == wid)[0].settings[x]]).concat(Object.keys(workspace.widgets.find(x => x.wid == wid).settings).map(x => [x, workspace.widgets.find(x => x.wid == wid).settings[x]])).forEach(x => {
        if (x[1] == undefined) {
            x[1] = widgetData.settings[x[0]].default || '';
        }
        
        const p = document.createElement('p');
        p.innerText = x[0].replace(x[0][0], x[0][0].toUpperCase());
        const input = document.createElement('input');
        input.value = x[1];
        const div = document.createElement('div');
        div.className = 'horizontal-subdiv';
        div.appendChild(p);
        div.appendChild(input);
        overlay.appendChild(div);

        input.addEventListener('change', () => { 
            setSetting(wid, x[0], input.value);
            console.log(workspace.widgets.find(x => x.wid == wid).settings)
            validateSettings(wid);
            reloadWidget(wid, structuredClone(workspace.widgets.find(x => x.wid == wid).settings));
        });
    });

    const deletebtn = document.createElement('button');
    deletebtn.innerText = "Delete";
    overlay.appendChild(deletebtn);
    deletebtn.addEventListener('click', () => {
        workspace.widgets.splice(workspace.widgets.indexOf(workspace.widgets.find(x => x.wid == wid)));
        document.querySelector(`[data-wid='${wid}']`).childNodes.forEach(x => x.remove());
        document.querySelector(`[data-wid='${wid}']`).childNodes.forEach(x => x.remove());
        document.querySelector(`[data-wid='${wid}']`).className = '';
        document.querySelector(`[data-wid='${wid}']`).style = '';
    });

    document.body.appendChild(overlay);
    document.body.addEventListener('click', ev => {
        if (ev.target.id == 'container' || (ev.target.tagName == 'div' && ev.target.id != 'overlay')) { overlayClose(); } 
    });
}

/**
 * Loads the widget given into the parent.
 * @param {HTMLDivElement} parent parent to load into in the form of a div.
 * @param {string} name Name of the widget to loading.
 * @param {string} id ID of the widget.
 * @param {object} settings The widget's settings.
 * @param {object} data The widget's data.
 * @param {function} onError A function to be performed if an error occurs.
 * @returns {bool} True if successful, false if not.  
 */
async function loadWidget(parent, name, id, settings, _data, wid, onError=(err)=>console.error(err)) {
    if (name == null || settings == null) { onError(new Error("One required parameter is null.")); return false; }
    if (name.length == 0) { onError(new Error("'name' parameter is empty.")); return false; }
    // fix load
    const settingsHas = (x) => Object.hasOwn(settings, x);
    const dataHas = (x) => Object.hasOwn(_data, x);

    const prevColumns = currentRows;
    const prevRows = currentRows;

    var foundY;
    var coords = '';
    if (settingsHas('x')) { settings.x += 1; coords += settings.x; }
    else { 
        for (let y = 1; y <= currentRows; y++) {
            for (let x = 1; x <= currentColumns; x++) {
                if (document.getElementById(x + '/' + y) == null) { coords += x; foundY = y; }
            }
        }
        currentRows += 1;
        foundY = currentRows;
        coords += 1;
    }

    if (settingsHas('y')) { settings.y += 1; coords += '/' + settings.y; }
    else { coords += '/' + foundY; }
    console.log(coords);
    currentColumns += (parseInt(coords.split("/")[0]) - currentColumns) >= 0 ? parseInt(coords.split("/")[0]) - currentColumns : 0;
    currentRows += (parseInt(coords.split("/")[1]) - currentRows) >= 0 ? parseInt(coords.split("/")[1]) - currentRows : 0;

    currentColumns += settingsHas('width') ? settings.width - 1 : 0;
    currentRows += settingsHas('height') ? settings.height - 1 : 0;

    for (let y = prevRows; y < currentRows; y++) {
        parent.style.gridTemplateRows += row;
    }
    for (let x = prevColumns; x < currentColumns; x++) {
        parent.style.gridTemplateColumns += column;
    }
    for (let x = 1; x <= currentColumns + (has(settings, 'width') ? settings.width - 1 : 0); x++) {
        for (let y = 1; y <= currentRows + (has(settings, 'height') ? settings.height - 1 : 0); y++) {
            if (document.getElementById(x + '/' + y) != null) { continue; }
            const tmp = document.createElement('div');
            tmp.id = x + '/' + y;
            parent.appendChild(tmp);
        }
    }

    for (let x = coords.split('/')[0] + 1; x <= coords.split('/')[0]; x++) {
        const block = document.getElementById(x + '/' + coords.split('/')[1]);
        if (block == null) { continue; }
        block.remove();
    }
    for (let y = coords.split('/')[1] + 1; y <= coords.split('/')[1]; y++) {
        const block = document.getElementById(coords.split('/')[0] + '/' + y);
        if (block == null) { continue; }
        block.remove();
    }

    const container = document.getElementById(coords);
    container.className = 'widget';
    container.style.gridColumn = `${coords.split('/')[0]} / ${settingsHas('width') ? parseInt(coords.split('/')[0]) + settings.width : parseInt(coords.split('/')[0])}`;
    container.style.gridRow = `${coords.split('/')[1]} / ${settingsHas('height') ? parseInt(coords.split('/')[1]) + settings.height : parseInt(coords.split('/')[1])}`;


    if (settingsHas('height')) delete settings.height;
    if (settingsHas('width')) delete settings.width;
    if (settingsHas('x')) delete settings.x;
    if (settingsHas('y')) delete settings.y;

    const subdiv = document.createElement('div');
    subdiv.className = "subdiv";
    subdiv.innerHTML = `<div><p>${name}</p></div>\n<div><button id="${container.id}-btn">Settings</div>`

    const widgetData = JSON.parse(await (await fetch(`../static/widgets/${id}/${id}.widget.json`)).text());
    if (widgetData == null) { throw new Error("Widget data can't be found."); }

    const iframe = document.createElement('iframe');
    iframe.src = `../static/widgets/${id}/${widgetData.entry.path}?id=${wid}`;

    var settingsArray = Object.keys(settings).map((key) => [key, settings[key]]);
    settingsArray.forEach((setting, index) => {
        //if (!settingsHas(setting[0])) { return; }
        if (widgetData.settings[setting[0]].type != typeof setting[1]) {
            console.log(`Settings value ${setting[1]} (${typeof setting[1]} - from ${setting[0]}) is not of type ${widgetData.settings[setting[0]].type}`); 
            return; 
        }

        iframe.src += `&${setting[0]}=${setting[1]}`;
    });
    var dataArray = Object.keys(_data).map((key) => [key, _data[key]]);
    dataArray.forEach((value, index) => {
        if (widgetData.data[value[0]].type != typeof value[1]) { 
            console.log(`Data value ${value[1]} (${typeof value[1]} - from ${value[0]}) is not of type ${widgetData.data[value[0]].type}`);
            return;
        }

        iframe.src += `&${value[0]}=${value[1]}`;
    });

    var vendorSA = Object.keys(widgetData.settings).map(x => [x, widgetData.settings[x]]);
    vendorSA.forEach(s => {
        if (!iframe.src.includes(s[0])) {
            if (Object.hasOwn(s[1], 'default')) {
                iframe.src += `&${s[0]}=${s[1].default}`;
            }
        }
    });
    var vendorDA = Object.keys(widgetData.data).map(x => [x, widgetData.data[x]]);
    vendorDA.forEach(d => {
        if (!iframe.src.includes(d[0])) {
            if (Object.hasOwn(d[1], 'default')) {
                iframe.src += `&${d[0]}=${d[1].default}`;
            }
        }
    });

    container.dataset.wid = wid;
    container.appendChild(subdiv);
    container.appendChild(iframe);

    if (Object.hasOwn(widgetData, 'end')) {
        iframe.contentWindow.onload = (ev) => {
            console.log(iframe.contentWindow[widgetData.end]);
            endFunctions.push(iframe.contentWindow[widgetData.end]);
        }
    }

    document.getElementById(`${container.id}-btn`).addEventListener('click', () => openSettings(wid));
    //trim();
}

async function reloadWidget(wid, settings) {
    /**
     * @type {HTMLDivElement}
     */
    const container = document.querySelector(`[data-wid='${wid}']`);
    // make width work - copy load
    console.log(settings);
    if (has(settings, 'x')) {
        console.log(`Found x (${settings.x} ${container.id.split('/')[0] != settings.x ? '!=' : '=='}) ${container.id.split('/')[0]}`);
        settings.x++;
        const oldx = parseInt(container.id.split('/')[0]);
        if (oldx != settings.x) {
            container.id = settings.x + '/' + container.id.split('/')[1];
            container.style.gridColumn = settings.x;
        } 
        delete settings.x;
    }

    if (has(settings, 'y')) {
        settings.y++;
        const oldy = parseInt(container.id.split('/')[1]);
        if (oldy != settings.y) {
            container.id = container.id.split('/')[0] + '/' + settings.y;
            container.style.gridRow = settings.y;
        } 
        delete settings.x;
    }

    const coords = container.id;
    const parent = container.parentElement;

    const prevColumns = currentColumns;
    const prevRows = currentRows;

    currentColumns += (parseInt(coords.split("/")[0]) - currentColumns) >= 0 ? parseInt(coords.split("/")[0]) - currentColumns : 0;
    currentRows += (parseInt(coords.split("/")[1]) - currentRows) >= 0 ? parseInt(coords.split("/")[1]) - currentRows : 0;

    currentColumns += has(settings, 'width') ? settings.width - 1 : 0;
    currentRows += has(settings, 'height') ? settings.height - 1 : 0;

    for (let y = prevRows; y < currentRows; y++) {
        parent.style.gridTemplateRows += row;
    }
    for (let x = prevColumns; x < currentColumns; x++) {
        parent.style.gridTemplateColumns += column;
    }
    for (let x = 1; x <= currentColumns; x++) {
        for (let y = 1; y <= currentRows; y++) {
            if (document.getElementById(x + '/' + y) != null) { continue; }
            const tmp = document.createElement('div');
            tmp.id = x + '/' + y;
            parent.appendChild(tmp);
        }
    }

    for (let x = coords.split('/')[0] + 1; x <= coords.split('/')[0]; x++) {
        const block = document.getElementById(x + '/' + coords.split('/')[1]);
        if (block == null) { continue; }
        block.remove();
    }
    for (let y = coords.split('/')[1] + 1; y <= coords.split('/')[1]; y++) {
        const block = document.getElementById(coords.split('/')[0] + '/' + y);
        if (block == null) { continue; }
        block.remove();
    }

    container.style.gridColumn = `${coords.split('/')[0]} / ${has(settings, 'width') ? parseInt(coords.split('/')[0]) + settings.width : parseInt(coords.split('/')[0])}`;
    container.style.gridRow = `${coords.split('/')[1]} / ${has(settings, 'height') ? parseInt(coords.split('/')[1]) + settings.height : parseInt(coords.split('/')[1])}`;

    tryTo(() => delete settings.width);
    tryTo(() => delete settings.height);

    const params = new URLSearchParams(container.childNodes[1].src);
    Object.keys(settings).map((v) => [v, settings[v]]).forEach(setting => params.set(setting[0], setting[1]));
    container.childNodes[1].src = decodeURIComponent(params.toString());
    //trim();
}

function trim() {
    console.log(currentRows);
    const container = document.getElementById('container');
    const getgtc = () => container.style.gridTemplateColumns;
    for (; currentColumns < getgtc().split('minmax').length - 1;) {
        container.style.gridTemplateColumns = getgtc().substring(0, getgtc().lastIndexOf('minmax'));
    }
    const getgtr = () => container.style.gridTemplateRows;
    for (; currentRows < getgtr().split('minmax').length - 1;) {
        container.style.gridTemplateRows = getgtr().substring(0, getgtr().lastIndexOf('minmax'));
    }
    var highestX = 0;
    var highestY = 0;
    workspace.widgets.map(x => x.settings).forEach(x => {
        if (x.x + x.width - 1 > highestX) { highestX = x.x + x.width - 1; }
        if (x.y + x.height - 1 > highestY) { highestY = x.y + x.height - 1; }
    });
    
    for (; currentColumns > highestX;) {
        currentColumns -= 1;
        container.style.gridTemplateColumns = getgtc().substring(0, getgtc().lastIndexOf('minmax'));
    }
    for (; currentRows > highestY;) {
        currentRows -= 1;
        container.style.gridTemplateRows = getgtr().substring(0, getgtr().lastIndexOf('minmax'));
    }
}

/**
 * Creates a new widget.
 */
async function newWidget() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    overlayClose();

    widgetParts.forEach(async (part) => {
        if (String(part) == "ID") {
            const ids = (await window.api.fs.ls('static/widgets')).filter(d => !d.includes('.'));
            const stack = document.createElement('select');
            stack.id = 'id';
            ids.forEach(async id => {
                const widgetData = JSON.parse(new TextDecoder().decode(await window.api.fs.read(`static/widgets/${id}/${id}.widget.json`)));
                const option = document.createElement('option');
                option.value = id;
                option.innerText = widgetData.name;
                stack.appendChild(option);
            });
            const subdiv = document.createElement('div');
            subdiv.className = 'horizontal-subdiv';
            const p = document.createElement('p');
            p.innerText = part;
            subdiv.appendChild(p);
            subdiv.appendChild(stack);
            overlay.appendChild(subdiv);
            return;
        }
        part = String(part);
        const subdiv = document.createElement('div');
        subdiv.className = 'horizontal-subdiv';
        const p = document.createElement('p');
        p.innerText = part;
        const input = document.createElement('input');
        input.id = part.toLowerCase();
        subdiv.appendChild(p);
        subdiv.appendChild(input);
        overlay.appendChild(subdiv);
    });

    await new Promise((r) => setTimeout(r, 100));

    extraWidgetParts.forEach(part => {
        part = String(part);

        const subdiv = document.createElement('div');
        subdiv.className = 'horizontal-subdiv';
        const p = document.createElement('p');
        p.innerText = part;
        const input = document.createElement('input');
        input.id = part.toLowerCase();

        subdiv.appendChild(p);
        subdiv.appendChild(input);
        overlay.appendChild(subdiv);
    });

    await new Promise((r) => setTimeout(r, 100));

    const submit = document.createElement('button');
    submit.innerText = "Create";
    submit.addEventListener('click', async (ev) => {
        const settings = {};
        extraWidgetParts.forEach((part, index) => { settings[part.toLowerCase()] = document.getElementById(part.toLowerCase()).value == '' ? extraWidgetPartsDefaults[index]() : parseInt(document.getElementById(part.toLowerCase()).value); })
        console.log(settings);
        await loadWidget(document.getElementById('container'), document.getElementById('name').value, document.getElementById('id').value, settings, {}, highestID);
        const container = document.querySelector(`[data-wid='${highestID}']`);
        settings.x = parseInt(container.style.gridColumn.split('/')[0]) - 1;
        settings.y = parseInt(container.style.gridRow.split('/')[0]) - 1;
        settings.width = parseInt(container.style.gridColumn.split('/')[1]) - parseInt(container.style.gridColumn.split('/')[0]);
        settings.height = parseInt(container.style.gridRow.split('/')[1]) - parseInt(container.style.gridRow.split('/')[0]);
        workspace.widgets.push({ 
            name: document.getElementById('name').value,
            id: document.getElementById('id').value,
            settings: settings,
            wid: highestID,
            data: {}
        });
        highestID++;
        trim();
        closeOverlay();
    });
    overlay.appendChild(submit);

    document.body.appendChild(overlay);
    closeOverlay = () => overlay.remove();
}