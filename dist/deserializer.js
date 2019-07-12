"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deString = exports.deMapping = exports.deList = exports.deField = exports.deNumber = exports.deBool = void 0;

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var deBool = function deBool(x) {
  if (typeof x != 'boolean') {
    return new Error('Could not deserialize "' + String(x) + '" into a bool.');
  } else {
    return x;
  }
};

exports.deBool = deBool;

var deNumber = function deNumber(x) {
  if (typeof x != 'number') {
    return new Error('Could not deserialize "' + String(x) + '" into a number.');
  } else {
    return x;
  }
};

exports.deNumber = deNumber;

var deField = function deField(name, deserializer, x) {
  var deserialized = deserializer(x);

  if (deserialized instanceof Error) {
    return new Error("Could not deserialize field ".concat(name, ": ").concat(deserialized.message));
  } else {
    return deserialized;
  }
};

exports.deField = deField;

var deList = function deList(elementDeserializer, value) {
  if (Array.isArray(value)) {
    var list = value.map(elementDeserializer); // Flow doesn't support type refinement with Array.filter. See:
    // https://github.com/facebook/flow/issues/1414
    // const errors = results.filter(r => r instanceof Error)

    var errors = list.reduce(function (xs, x) {
      if (x instanceof Error) {
        return xs.concat([x]);
      } else {
        return xs;
      }
    }, []);

    if (errors.length > 0) {
      return new Error('Could not deserialize list due to errors in the elements: ' + errors.map(function (e) {
        return e.message;
      }).join('\\n'));
    } else {
      // Flow doesn't support type refinement with Array.filter. See:
      // https://github.com/facebook/flow/issues/1414
      return list.reduce(function (xs, x) {
        return x instanceof Error ? xs : xs.concat([x]);
      }, []);
    }
  } else {
    return new Error('Could not deserialize "' + String(value) + '" into an Array');
  }
};

exports.deList = deList;

var deMapping = function deMapping(keyDeserializer, valueDeserializer, x) {
  if (x == null || _typeof(x) != 'object') {
    return new Error('Could not deserialize ' + String(x) + ' into an object.');
  } else {
    var keys = deList(keyDeserializer, Object.keys(x));

    if (keys instanceof Error) {
      return new Error('Could not deserialize keys: ' + keys.message);
    } else {
      var values = deList(valueDeserializer, Object.values(x));

      if (values instanceof Error) {
        return new Error('Could not deserialize values: ' + values.message);
      } else {
        var result = {};

        for (var i = 0; i < keys.length; ++i) {
          result[keys[i]] = values[i];
        }

        return result;
      }
    }
  }
};

exports.deMapping = deMapping;

var deString = function deString(x) {
  if (typeof x != 'string') {
    return new Error('Could not deserialize "' + String(x) + '" into a string.');
  } else {
    return x;
  }
};

exports.deString = deString;