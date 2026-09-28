using System.Text.RegularExpressions;

namespace HRTimeTracking.Api.Models;

/// <summary>
/// 3-character kiosk passcode rules. Printable keyboard characters only (ASCII 33–126).
/// </summary>
public static class EmployeePasscodeRules
{
    public const int Length = 3;
    public const int MaxAttempts = 5;
    public const int LockoutMinutes = 10;

    public const string AllowedDescription =
        "letters A–Z a–z, numbers 0–9, and keyboard symbols ! \" # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~";

    private static readonly Regex Allowed = new(@"^[\x21-\x7E]+$", RegexOptions.Compiled);

    public static string? Validate(string? passcode)
    {
        if (string.IsNullOrEmpty(passcode))
            return "Enter your 3-character passcode.";

        var invalid = passcode.Where(c => c < 0x21 || c > 0x7E).Distinct().ToArray();
        if (invalid.Length > 0)
        {
            var shown = string.Join(", ", invalid.Select(DescribeChar));
            return $"This character cannot be used: {shown}. Allowed characters: {AllowedDescription}.";
        }

        if (!Allowed.IsMatch(passcode))
            return $"This character cannot be used. Allowed characters: {AllowedDescription}.";

        if (passcode.Length != Length)
            return "Passcode must be exactly 3 characters.";

        return null;
    }

    private static string DescribeChar(char c)
    {
        if (char.IsControl(c) || c is ' ')
            return "an unrecognized or non-keyboard character";
        return $"'{c}'";
    }
}
