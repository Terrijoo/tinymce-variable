/**
 * plugin.js
 *
 * Copyright, BuboBox
 * Released under MIT License.
 *
 * License: https://www.bubobox.com
 * Contributing: https://www.bubobox.com/contributing
 */

/*global tinymce:true */

tinymce.PluginManager.add('variable', function (editor) {
  var $ = require('jquery');

  var VK = tinymce.util.VK;

  /**
   * Object that is used to replace the variable string to be used
   * in the HTML view
   * @type {object}
   */
  var mapper = editor.getParam('variable_mapper', {});

  /**
   * define a list of variables that are allowed
   * if the variable is not in the list it will not be automatically converterd
   * by default no validation is done
   * @todo  make it possible to pass in a function to be used a callback for validation
   * @type {array}
   */
  var valid = editor.getParam('variable_valid', null);

  /**
   * Get custom variable class name
   * @type {string}
   */
  var className = editor.getParam('variable_class', 'variable');

  /**
   * Prefix and suffix to use to mark a variable
   * @type {string}
   */
  var prefix = editor.getParam('variable_prefix', '{{');
  var suffix = editor.getParam('variable_suffix', '}}');

  var autoComplete;
  var autoCompleteData = editor.getParam('variables');
  autoCompleteData.delimiter = (autoCompleteData.delimiter !== undefined) ? autoCompleteData.delimiter : prefix;

  var AutoComplete = function (ed, options) {
    this.editor = ed;

    this.options = $.extend({}, {
      source: [],
      delay: 500,
      queryBy: 'name',
      items: 10,
    }, options);

    this.options.insertFrom = this.options.insertFrom || this.options.queryBy;

    this.matcher = this.options.matcher || this.matcher;
    this.sorter = this.options.sorter || this.sorter;
    this.renderDropdown = this.options.renderDropdown || this.renderDropdown;
    this.render = this.options.render || this.render;
    this.insert = this.options.insert || this.insert;
    this.highlighter = this.options.highlighter || this.highlighter;

    this.query = '';
    this.hasFocus = true;

    this.renderInput();

    this.bindEvents();
  };

  AutoComplete.prototype = {

    constructor: AutoComplete,

    renderInput: function () {
      var rawHtml = '<span id="autocomplete">' +
        '<span id="autocomplete-delimiter">' + this.options.delimiter + '</span>' +
        '<span id="autocomplete-searchtext"><span class="dummy">\uFEFF</span></span>' +
        '</span>';

      this.editor.execCommand('mceInsertContent', false, rawHtml);
      this.editor.focus();
      this.editor.selection.select(this.editor.selection.dom.select('span#autocomplete-searchtext span')[0]);
      this.editor.selection.collapse(0);
    },

    bindEvents: function () {
      this.editor.on('keyup', this.editorKeyUpProxy = $.proxy(this.rteKeyUp, this));
      this.editor.on('keydown', this.editorKeyDownProxy = $.proxy(this.rteKeyDown, this), true);
      this.editor.on('click', this.editorClickProxy = $.proxy(this.rteClicked, this));

      // $('body').on('click', this.bodyClickProxy = $.proxy(this.rteLostFocus, this));

      $(this.editor.getWin()).on('scroll', this.rteScroll = $.proxy(function () {
        this.cleanUp(true);
      }, this));
    },

    unbindEvents: function () {
      this.editor.off('keyup', this.editorKeyUpProxy);
      this.editor.off('keydown', this.editorKeyDownProxy);
      this.editor.off('click', this.editorClickProxy);

      $('body').off('click', this.bodyClickProxy);

      $(this.editor.getWin()).off('scroll', this.rteScroll);
    },

    rteKeyUp: function (e) {
      switch (e.which || e.keyCode) {
        //DOWN ARROW
        case 40:
        //UP ARROW
        case 38:
        //SHIFT
        case 16:
        //CTRL
        case 17:
        //ALT
        case 18:
          break;

        //BACKSPACE
        case 8:
          if (this.query === '') {
            this.cleanUp(true);
          } else {
            this.lookup();
          }
          break;

        //TAB
        case 9:
        //ENTER
        case 13:
          var item = (this.$dropdown !== undefined) ? this.$dropdown.find('li.active') : [];
          if (item.length) {
            this.select(item.data());
            this.cleanUp(false);
          } else {
            this.cleanUp(true);
          }
          break;

        //ESC
        case 27:
          this.cleanUp(true);
          break;

        default:
          this.lookup();
      }
    },

    rteKeyDown: function (e) {
      switch (e.which || e.keyCode) {
        //TAB
        case 9:
        //ENTER
        case 13:
        //ESC
        case 27:
          e.preventDefault();
          break;

        //UP ARROW
        case 38:
          e.preventDefault();
          if (this.$dropdown !== undefined) {
            this.highlightPreviousResult();
          }
          break;
        //DOWN ARROW
        case 40:
          e.preventDefault();
          if (this.$dropdown !== undefined) {
            this.highlightNextResult();
          }
          break;
      }

      e.stopPropagation();
    },

    rteClicked: function (e) {
      var $target = $(e.target);

      if (this.hasFocus && $target.parent().attr('id') !== 'autocomplete-searchtext') {
        this.cleanUp(true);
      }
    },

    rteLostFocus: function () {
      if (this.hasFocus) {
        this.cleanUp(true);
      }
    },

    lookup: function () {
      var body = $(this.editor.getBody());
      var autoCompleteSearchText = body.find('#autocomplete-searchtext');
      this.query = $.trim(autoCompleteSearchText.text()).replace('\ufeff', '');
      if (this.query === '') {
        var autoComplete = body.find('#autocomplete');
        if (autoComplete.length) {
          autoCompleteSearchText.appendTo(autoComplete);
          this.editor.selection.select(autoCompleteSearchText.find('span')[0]);
        } else {
          this.cleanUp(true);
        }
      }

      if (this.$dropdown === undefined) {
        this.show();
      }

      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout($.proxy(function () {
        // Added delimiter parameter as last argument for backwards compatibility.
        var items = $.isFunction(this.options.source) ? this.options.source(this.query, $.proxy(this.process, this), this.options.delimiter) : this.options.source;
        if (items) {
          this.process(items);
        }
      }, this), this.options.delay);
    },

    matcher: function (item) {
      return ~item[this.options.queryBy].toLowerCase().indexOf(this.query.toLowerCase());
    },

    sorter: function (items) {
      var beginswith = [],
        caseSensitive = [],
        caseInsensitive = [],
        item;

      while ((item = items.shift()) !== undefined) {
        if (!item[this.options.queryBy].toLowerCase().indexOf(this.query.toLowerCase())) {
          beginswith.push(item);
        } else if (~item[this.options.queryBy].indexOf(this.query)) {
          caseSensitive.push(item);
        } else {
          caseInsensitive.push(item);
        }
      }

      return beginswith.concat(caseSensitive, caseInsensitive);
    },

    highlighter: function (text) {
      return text.replace(new RegExp('(' + this.query.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1') + ')', 'ig'), function ($1, match) {
        return '<strong>' + match + '</strong>';
      });
    },

    show: function () {
      var offset = this.editor.inline ? this.offsetInline() : this.offset();

      if (!offset) {
        return false;
      }

      this.$dropdown = $(this.renderDropdown())
        .css({'top': offset.top, 'left': offset.left});

      $('body').append(this.$dropdown);

      this.$dropdown.on('click', $.proxy(this.autoCompleteClick, this));
    },

    process: function (data) {
      if (!this.hasFocus) {
        return;
      }

      var _this = this,
        result = [],
        items = $.grep(data, function (item) {
          return _this.matcher(item);
        });

      items = _this.sorter(items);

      if (this.options.items === -1) {
        items = items.slice();
      } else {
        items = items.slice(0, this.options.items);
      }

      $.each(items, function (i, item) {
        var $element = $(_this.render(item, i));

        var textNodes = $element.find('*').addBack().contents().filter(function () {
          return this.nodeType === 3; //Node.TEXT_NODE
        }).each(function (index, element) {
          $(element).parent().html(_this.highlighter(element.textContent));
        });

        $element.html($element.html().replace($element.text(), _this.highlighter($element.text())));

        $.each(items[i], function (key, val) {
          $element.attr('data-' + key, val);
        });

        result.push($element[0].outerHTML);
      });

      if (result.length) {
        this.$dropdown.html(result.join('')).show();
        this.highlightNextResult();
      } else {
        this.$dropdown.hide();
        this.$dropdown.find('li').removeClass('active');
      }
    },

    renderDropdown: function () {
      return '<ul class="rte-autocomplete dropdown-menu"><li class="loading"></li></ul>';
    },

    render: function (item, index) {
      return '<li>' +
        '<a href="javascript:;"><span>' + item[this.options.queryBy] + '</span></a>' +
        '</li>';
    },

    autoCompleteClick: function (e) {
      var item = $(e.target).closest('li').data();
      if (!$.isEmptyObject(item)) {
        this.select(item);
        this.cleanUp(false);
      }
      e.stopPropagation();
      e.preventDefault();
    },

    highlightPreviousResult: function () {
      var currentIndex = this.$dropdown.find('li.active').index(),
        index = (currentIndex === 0) ? this.$dropdown.find('li').length - 1 : --currentIndex;

      this.$dropdown.find('li').removeClass('active').eq(index).addClass('active');
      this.scrollItemIntoView(index);
    },

    highlightNextResult: function () {
      var currentIndex = this.$dropdown.find('li.active').index(),
        index = (currentIndex === this.$dropdown.find('li').length - 1) ? 0 : ++currentIndex;

      this.$dropdown.find('li').removeClass('active').eq(index).addClass('active');
      this.scrollItemIntoView(index);
    },

    scrollItemIntoView: function (index) {
      var listItems = this.$dropdown.find('li');
      this.$dropdown.scrollTop(listItems.eq(index).position().top - listItems.eq(0).position().top - this.$dropdown.height() / 2);
    },

    select: function (item) {
      this.editor.focus();
      $(this.editor.dom.select('span#autocomplete')).replaceWith(this.insert(item));
      stringToHTML();
    },

    insert: function (item) {
      return prefix + item[this.options.insertFrom] + suffix;
    },

    cleanUp: function (rollback) {
      this.unbindEvents();
      this.hasFocus = false;

      if (this.$dropdown !== undefined) {
        this.$dropdown.remove();
        delete this.$dropdown;
      }

      if (rollback) {
        var text = this.query,
          $selection = $(this.editor.dom.select('span#autocomplete'));

        if (!$selection.length) {
          return;
        }

        var replacement = $('<p>' + prefix + text + suffix.substr(-1, 1) + '</p>')[0].firstChild,
          focus = $(this.editor.selection.getNode()).offset().top === ($selection.offset().top + (($selection.outerHeight() - $selection.height()) / 2));

        this.editor.dom.replace(replacement, $selection[0])


        if (focus) {
          this.editor.selection.select(replacement);
          this.editor.selection.collapse();
        }
      }
    },

    offset: function () {
      var rtePosition = $(this.editor.getContainer()).offset(),
        contentAreaPosition = $(this.editor.getContentAreaContainer()).position(),
        nodePosition = $(this.editor.dom.select('span#autocomplete')).position(),
        iframePosition = $(this.editor.iframeElement).position();

      if (!nodePosition) {
        return false;
      }

      return {
        top: rtePosition.top + contentAreaPosition.top + nodePosition.top + $(this.editor.selection.getNode()).innerHeight() - $(this.editor.getDoc()).scrollTop() + 5,
        left: rtePosition.left + contentAreaPosition.left + nodePosition.left + iframePosition.left,
      };
    },

    offsetInline: function () {
      var nodePosition = $(this.editor.dom.select('span#autocomplete')).offset();

      return {
        top: nodePosition.top + $(this.editor.selection.getNode()).innerHeight() + 5,
        left: nodePosition.left,
      };
    },

  };

  /**
   * RegExp is not stateless with '\g' so we return a new variable each call
   * @return {RegExp}
   */
  function getStringVariableRegex() {
    return new RegExp(prefix + '[a-z_A-Z]+' + suffix, 'g');
  }

  /**
   * check if a certain variable is valid
   * @param {string} name
   * @return {bool}
   */
  function isValid(name) {

    if (!valid || valid.length === 0)
      return true;

    var validString = '|' + valid.join('|') + '|';

    return validString.indexOf('|' + name + '|') > -1 ? true : false;
  }

  function getMappedValue(cleanValue) {
    if (typeof mapper === 'function')
      return mapper(cleanValue);

    return mapper.hasOwnProperty(cleanValue) ? mapper[cleanValue] : cleanValue;
  }

  /**
   * Strip variable to keep the plain variable string
   * @example "{test}" => "test"
   * @param {string} value
   * @return {string}
   */
  function cleanVariable(value) {
    return value.replace(/[^a-zA-Z0-9._]/g, '');
  }

  /**
   * convert a text variable "x" to a span with the needed
   * attributes to style it with CSS
   * @param  {string} value
   * @return {string}
   */
  function createHTMLVariable(value) {

    var cleanValue = cleanVariable(value);

    // check if variable is valid
    if (!isValid(cleanValue))
      return value;

    var cleanMappedValue = getMappedValue(cleanValue);

    editor.fire('variableToHTML', {
      value: value,
      cleanValue: cleanValue,
    });

    var variable = prefix + cleanValue + suffix;
    return editor.dom.create('span', { 'class': className, 'data-original-variable': variable, contenteditable: false}, cleanMappedValue);
  }

  function createHTMLVariable2(value) {

    var cleanValue = cleanVariable(value);

    // check if variable is valid
    if (!isValid(cleanValue))
      return value;

    var cleanMappedValue = getMappedValue(cleanValue);

    editor.fire('variableToHTML', {
      value: value,
      cleanValue: cleanValue,
    });

    var variable = prefix + cleanValue + suffix;
    return '<span class="' + className + '" data-original-variable="' + variable + '" contenteditable="false">' + cleanMappedValue + '</span>';
  }

  /**
   * convert variable strings into html elements
   * @return {void}
   */
  function stringToHTML() {
    var nodeList = [],
      nodeValue,
      node,
      div;

    // find nodes that contain a string variable
    tinymce.walk(editor.getBody(), function (n) {
      if (n.nodeType == 3 && n.nodeValue && getStringVariableRegex().test(n.nodeValue)) {
        nodeList.push(n);
      }
    }, 'childNodes');

    // loop over all nodes that contain a string variable
    for (var i = 0; i < nodeList.length; i++) {
      nodeValue = nodeList[i].nodeValue.replace(getStringVariableRegex(), createHTMLVariable2);
      div = editor.dom.create('div', null, nodeValue);
      while ((node = div.lastChild)) {
        editor.dom.insertAfter(node, nodeList[i]);

        if (isVariable(node)) {
          editor.selection.select(node);
          editor.selection.collapse(0);
        }
      }

      editor.dom.remove(nodeList[i]);
    }
  }

  function handleInput(e) {
    if (e.key + prevChar(1) === prefix) {
      if (autoComplete === undefined || (autoComplete.hasFocus !== undefined && !autoComplete.hasFocus)) {
        e.preventDefault();
        var editorRange = editor.selection.getRng(); // get range object for the current caret position

        var node = editorRange.commonAncestorContainer; // relative node to the selection

        range = document.createRange(); // create a new range object for the deletion
        range.selectNodeContents(node);
        range.setStart(node, editorRange.endOffset - 1); // current caret pos - 1
        range.setEnd(node, editorRange.endOffset); // current caret pos
        range.deleteContents();

        editor.focus(); // brings focus back to the editor
        // Clone options object and set the used delimiter.
        autoComplete = new AutoComplete(editor, autoCompleteData);
      }
    } else if (prevChar(1) + e.key === suffix) {
      e.preventDefault();
      var editorRange = editor.selection.getRng(); // get range object for the current caret position

      var node = editorRange.commonAncestorContainer; // relative node to the selection

      range = document.createRange(); // create a new range object for the deletion
      range.selectNodeContents(node);
      range.setStart(node, editorRange.endOffset - 1); // current caret pos - 1
      range.setEnd(node, editorRange.endOffset); // current caret pos
      range.deleteContents();

      editor.focus(); // brings focus back to the editor
      autoComplete.cleanUp(true);
      stringToHTML();
    }
  }

  function prevChar(amount) {
    var start = editor.selection.getRng(true).startOffset;
    var text = editor.selection.getRng(true).startContainer.data || '';
    var character = text.substr(start > 0 ? start - amount : 0, amount);

    return character;
  }

  /**
   * convert HTML variables back into their original string format
   * for example when a user opens source view
   * @return {void}
   */
  function htmlToString() {
    var nodeList = [],
      nodeValue,
      node,
      div;

    // find nodes that contain a HTML variable
    tinymce.walk(editor.getBody(), function (n) {
      if (n.nodeType == 1) {
        var original = n.getAttribute('data-original-variable');
        if (original !== null) {
          nodeList.push(n);
        }
      }
    }, 'childNodes');

    // loop over all nodes that contain a HTML variable
    for (var i = 0; i < nodeList.length; i++) {
      nodeValue = nodeList[i].getAttribute('data-original-variable');
      div = editor.dom.create('div', null, nodeValue);
      while ((node = div.lastChild)) {
        editor.dom.insertAfter(node, nodeList[i]);
      }

      // remove HTML variable node
      // because we now have an text representation of the variable
      editor.dom.remove(nodeList[i]);
    }
  }

  /**
   * handle formatting the content of the editor based on
   * the current format. For example if a user switches to source view and back
   * @param  {object} e
   * @return {void}
   */
  function handleContentRerender(e) {
    return e.format === 'raw' ? stringToHTML() : htmlToString();
  }

  /**
   * insert a variable into the editor at the current cursor location
   * @param {string} value
   * @return {void}
   */
  function addVariable(value) {
    var newNode = createHTMLVariable(value);
    // editor.execCommand('mceInsertContent', false, htmlVariable);
    /*
    ed.dom.create('div', {}, 'This is a new DIV');
    ed.selection.setNode(newNode);
    ed.selection.select(ed.selection.getNode(newNode));
     */
    editor.selection.setNode(newNode);
    editor.selection.select(editor.selection.getNode(newNode));
    // editor.selection.select(htmlVariable);
    editor.selection.collapse(0);
  }

  function isVariable(element) {
    if (typeof element.getAttribute === 'function' && element.hasAttribute('data-original-variable'))
      return true;

    return false;
  }

  /**
   * Trigger special event when user clicks on a variable
   * @return {void}
   */
  function handleClick(e) {
    var target = e.target;

    if (!isVariable(target))
      return null;

    var value = target.getAttribute('data-original-variable');
    editor.fire('variableClick', {
      value: cleanVariable(value),
      target: target,
    });
  }

  function preventDrag(e) {
    var target = e.target;

    if (!isVariable(target))
      return null;

    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // editor.on('beforegetcontent', handleContentRerender);
  // editor.on('getcontent', stringToHTML);
  editor.on('click', handleClick);
  editor.on('mousedown', preventDrag);
  editor.on('keypress', handleInput);

  this.addVariable = addVariable;

});
