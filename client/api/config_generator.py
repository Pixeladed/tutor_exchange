import sys
import io


def generate(username, password):
	lines = []

	lines.append("module.exports = {")
	lines.append("  secret: 'imasecretdonttellanyone',")
	lines.append("")
	lines.append("  mysqlSettings: {")
	lines.append("    host: '127.0.0.1',")
	lines.append("    port: '3306',")
	lines.append("    user: '" + username + "',")
	lines.append("    password: '" + password + "',")
	lines.append("    database: 'tutorExchangeDB',")
	lines.append("  },")
	lines.append("")
	lines.append("  server: {")
	lines.append("    port: '8080',")
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