import sys
import io
import string
import random

'''
config_generator.py
A python script for generating the server config file.
I'm using python 3.3.0

Usage:
	python3 config_generator.py [mysql username] [mysql password]

'''


def generate(username, password):

	jwt_key = ''.join(random.SystemRandom().choice(string.ascii_uppercase + string.digits) for _ in range(16))

	lines = []

	lines.append("module.exports = {")
	lines.append("  secret: '" + jwt_key + "',")
	lines.append("")
	lines.append("  mysqlSettings: {")
	lines.append("    host: 'localhost',")
	lines.append("    port: '3306',")
	lines.append("    user: '" + username + "',")
	lines.append("    password: '" + password + "',")
	lines.append("    database: 'tutorexchange',")
	lines.append("  },")
	lines.append("")
	lines.append("  server: {")
	lines.append("    port: '8080',")
	lines.append("  },")
	lines.append("")
	lines.append("  devOptions: {")
	lines.append("    serveStatic: true,")
	lines.append("    sendMail: false,")
	lines.append("  },")
	lines.append("")
	lines.append("  mailgunServer: {")
	lines.append("    user: 'postmaster@mail.volunteertutorexchange.com',")
	lines.append("    pass: '',")
	lines.append("  },")
	lines.append("};")
	lines.append("")

	return '\n'.join(lines)




def main():
	username = ''
	password = ''
	if(len(sys.argv) != 3):
		print('Usage: python3 config_generator.py [mysql username] [mysql password]')
		return

	username = sys.argv[1]
	password = sys.argv[2]
	f = open("config.js", 'w')
	f.write(generate(username, password));
	f.close()

	return


if __name__ == '__main__':
    main()